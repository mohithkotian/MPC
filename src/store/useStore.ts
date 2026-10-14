import { create } from 'zustand';
import { BankId, BankPattern, PadConfig, ProjectData, ViewMode } from '../types';
import { audioEngine } from '../services/audio/AudioEngine';
import { createEmptyBank, KEY_LABELS, PRESET_KITS } from '../services/audio/presetKits';
import {
  saveProjectToDB,
  saveSampleBlobToDB,
  loadSampleBlobFromDB,
  loadProjectsFromDB,
  readLastSession,
  writeLastSession,
} from '../services/db/storage';
import { saveCloudProject, loadCloudProject } from '../services/projects/projectApi';
import { hasSoloPad, shouldPlayPad, getSwingDelayMs } from '../services/audio/padRouting';
import { cloneMusicalSnapshot, createMusicalSnapshot, MusicalSnapshot } from '../services/projects/musicalHistory';

export type ProjectSaveStatus = 'idle' | 'cloud-success' | 'local-only' | 'failed';

export type PadSampleStatus = 'idle' | 'loading' | 'loaded' | 'failed';

export interface PadSampleState {
  status: PadSampleStatus;
  error?: string | null;
}

export interface SampleUploadState {
  status: 'idle' | 'validating' | 'decoding' | 'saving' | 'success' | 'error';
  message: string;
  padKey?: string;
}

const BANK_KEYS: BankId[] = ['A', 'B', 'C', 'D'];
const SAMPLE_LOAD_CONCURRENCY = 4;
const MAX_SAMPLE_BYTES = 30 * 1024 * 1024;
const SUPPORTED_AUDIO_EXTENSIONS = ['wav', 'mp3', 'ogg', 'm4a', 'aac', 'flac', 'webm', 'aif', 'aiff', 'mp4'];

async function mapWithLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

function emptySampleStates(): Record<string, PadSampleState> {
  const states: Record<string, PadSampleState> = {};
  for (const bank of BANK_KEYS) {
    for (let i = 0; i < 16; i += 1) states[`${bank}-${i}`] = { status: 'idle' };
  }
  return states;
}

function describeError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

interface MPCState {
  activeBank: BankId;
  viewMode: ViewMode;
  selectedPadIndex: number;

  bpm: number;
  swing: number;
  masterVolume: number;
  recGain: number;
  noteVariation: number;
  metronome: boolean;

  isPlaying: boolean;
  isRecording: boolean;
  isOverdubbing: boolean;
  currentStep: number;

  projectId: string;
  projectName: string;
  projectArtist: string;
  saveStatus: ProjectSaveStatus;
  lastSaveError: string | null;
  activePresetId: string;
  customKitNames: Record<string, string>;
  kitLoadStatus: 'idle' | 'loading' | 'ready' | 'partial' | 'failed';
  kitLoadError: string | null;
  projectLoadStatus: 'idle' | 'loading' | 'error';
  projectLoadError: string | null;
  canUndo: boolean;
  canRedo: boolean;

  /** Per-pad sample load state keyed `${bank}-${padIndex}`. */
  padSampleState: Record<string, PadSampleState>;
  sampleUpload: SampleUploadState;

  banks: Record<BankId, PadConfig[]>;
  patterns: Record<BankId, BankPattern>;
  activeTriggeredPads: Record<number, boolean>;

  isInfoActive: boolean;
  toggleInfoMode: () => void;

  isCameraActive: boolean;
  gestureTargetPad: number;
  cameraPermissionState: 'prompt' | 'granted' | 'denied';
  toggleCamera: () => void;
  setGestureTargetPad: (padIndex: number) => void;
  setCameraPermissionState: (state: 'prompt' | 'granted' | 'denied') => void;

  setActiveBank: (bank: BankId) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedPadIndex: (index: number) => void;

  triggerPad: (bankPadIndex: number, velocity?: number) => void;
  updatePad: (bankId: BankId, bankPadIndex: number, updates: Partial<PadConfig>) => void;
  togglePadMute: (bankId: BankId, bankPadIndex: number) => void;
  togglePadSolo: (bankId: BankId, bankPadIndex: number) => void;
  renamePad: (bankId: BankId, bankPadIndex: number, name: string) => void;
  renameKit: (kitId: string, name: string) => void;
  assignSynthToPad: (bankId: BankId, bankPadIndex: number, synthType: any, name: string) => void;
  uploadSampleToPad: (bankId: BankId, bankPadIndex: number, file: File) => Promise<void>;
  reloadPadSample: (bankId: BankId, bankPadIndex: number) => Promise<void>;

  toggleStep: (bankPadIndex: number, stepIndex: number) => void;
  setStepVelocity: (bankPadIndex: number, stepIndex: number, velocity: number) => void;
  clearBankPattern: (bankId: BankId) => void;
  undo: () => void;
  redo: () => void;

  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setMasterVolume: (vol: number) => void;
  setRecGain: (gain: number) => void;
  setNoteVariation: (val: number) => void;
  toggleMetronome: () => void;

  togglePlay: () => void;
  stopPlayback: () => void;
  stopAllPlayback: () => void;
  toggleRecord: () => void;
  toggleOverdub: () => void;

  loadPresetKit: (kitId: string) => Promise<void>;
  saveCurrentProject: (name?: string) => Promise<ProjectSaveStatus>;
  loadProjectFromStorage: (project: ProjectData) => Promise<void>;
  restoreSession: () => Promise<void>;
}

function createEmptyPattern(bankId: BankId): BankPattern {
  return {
    bankId,
    pads: Array.from({ length: 16 }, (_, padIdx) => ({
      padId: padIdx,
      steps: Array.from({ length: 16 }, () => ({ active: false, velocity: 0.9 }))
    }))
  };
}

export const useStore = create<MPCState>((set, get) => {
  // --- Sequencer scheduler (audio-clock lookahead, single loop) ---
  let schedulerTimer: number | null = null;
  let nextStepTime = 0;
  let scheduleStepIndex = 0;
  let uiStepQueue: Array<{ step: number; time: number }> = [];
  const SCHEDULER_TICK_MS = 25;
  const LOOKAHEAD_SECONDS = 0.12;

  // --- Kit/project load request guards ---
  let kitLoadRequest = 0;
  let projectLoadRequest = 0;

  // --- Undo/redo history ---
  const undoStack: MusicalSnapshot[] = [];
  const redoStack: MusicalSnapshot[] = [];
  let lastEditKey: string | null = null;
  let lastEditAt = 0;

  const rememberMusicalEdit = (target?: string) => {
    const now = Date.now();
    // Coalesce rapid repeated edits to the same control (e.g. a knob drag) into
    // one undo entry: the first snapshot already captures the pre-drag state.
    if (target && lastEditKey === target && now - lastEditAt < 600) {
      lastEditAt = now;
      return;
    }
    lastEditKey = target ?? null;
    lastEditAt = now;
    const state = get();
    undoStack.push(createMusicalSnapshot(state.banks, state.patterns));
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0;
    set({ canUndo: undoStack.length > 0, canRedo: false });
  };

  const syncRouting = (banks: Record<BankId, PadConfig[]>) => {
    const muted: string[] = [];
    const solo: string[] = [];
    for (const bank of BANK_KEYS) {
      const pads = banks[bank] ?? [];
      pads.forEach((pad, idx) => {
        const key = `${bank}-${idx}`;
        if (pad.isMuted) muted.push(key);
        if (pad.isSolo && !pad.isMuted) solo.push(key);
      });
    }
    audioEngine.applyPadRouting(muted, solo);
  };

  const setPadStatus = (key: string, status: PadSampleStatus, error?: string | null, guard?: () => boolean) => {
    if (guard && !guard()) return;
    set((s) => ({ padSampleState: { ...s.padSampleState, [key]: { status, error: error ?? null } } }));
  };

  /** Load a single pad's sample audio (from IndexedDB for uploads, or from the network/secure stream). */
  const loadPadSample = async (pad: PadConfig): Promise<AudioBuffer> => {
    if (pad.sampleId) {
      const stored = await loadSampleBlobFromDB(pad.sampleId);
      if (!stored) throw new Error('Saved audio for this pad was not found in local storage');
      const buffer = await audioEngine.decodeArrayBuffer(stored.data);
      audioEngine.registerBuffer(pad.sampleId, buffer);
      return buffer;
    }
    if (pad.audioUrl) {
      return audioEngine.loadAudioFromUrl(pad.audioUrl);
    }
    throw new Error('Pad has no sample to load');
  };

  /**
   * Re-attach decoded audio to a pad, preferring the in-memory cache and falling
   * back to an async reload. Async results are dropped if the pad's assignment
   * changed in the meantime (e.g. the user loaded a different kit).
   */
  const hydratePadAudio = (bankId: BankId, pad: PadConfig) => {
    const key = `${bankId}-${pad.bankPadIndex}`;
    if (!pad.sampleId && !pad.audioUrl) {
      pad.audioBuffer = null;
      setPadStatus(key, 'idle');
      return;
    }
    const cacheKey = pad.sampleId ?? pad.audioUrl!;
    const cached = audioEngine.getCachedBuffer(cacheKey);
    if (cached) {
      pad.audioBuffer = cached;
      setPadStatus(key, 'loaded');
      return;
    }
    pad.audioBuffer = null;
    setPadStatus(key, 'loading');
    const stillCurrent = () => {
      const current = get().banks[bankId]?.[pad.bankPadIndex];
      return Boolean(current && current.sampleId === pad.sampleId && current.audioUrl === pad.audioUrl);
    };
    void loadPadSample(pad)
      .then((buffer) => {
        if (!stillCurrent()) return;
        const current = get().banks[bankId]![pad.bankPadIndex];
        current.audioBuffer = buffer;
        setPadStatus(key, 'loaded');
        set((s) => ({ banks: { ...s.banks, [bankId]: [...s.banks[bankId]] } }));
      })
      .catch((err) => {
        if (!stillCurrent()) return;
        const current = get().banks[bankId]![pad.bankPadIndex];
        current.audioBuffer = null;
        setPadStatus(key, 'failed', describeError(err, 'Sample failed to load'));
        set((s) => ({ banks: { ...s.banks, [bankId]: [...s.banks[bankId]] } }));
      });
  };

  const restoreMusicalSnapshot = (snapshot: MusicalSnapshot) => {
    const current = get();
    const banks = {} as Record<BankId, PadConfig[]>;
    for (const bank of BANK_KEYS) {
      banks[bank] = snapshot.banks[bank].map((pad) => {
        const old = current.banks[bank].find((candidate) => candidate.id === pad.id);
        const sameSample = old?.sampleId === pad.sampleId && old?.audioUrl === pad.audioUrl;
        return { ...pad, audioBuffer: sameSample ? old?.audioBuffer ?? null : null };
      });
    }
    set({ banks, patterns: snapshot.patterns, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
    syncRouting(banks);
    for (const bank of BANK_KEYS) {
      for (const pad of banks[bank]) hydratePadAudio(bank, pad);
    }
  };

  const initialBanks: Record<BankId, PadConfig[]> = {
    A: createEmptyBank('A'),
    B: createEmptyBank('B'),
    C: createEmptyBank('C'),
    D: createEmptyBank('D'),
  };

  const initialPatterns: Record<BankId, BankPattern> = {
    A: createEmptyPattern('A'),
    B: createEmptyPattern('B'),
    C: createEmptyPattern('C'),
    D: createEmptyPattern('D'),
  };

  // --- Recording helpers ---
  const recordPadHit = (bankPadIndex: number, playedVelocity: number) => {
    const state = get();
    if (!state.isPlaying || (!state.isRecording && !state.isOverdubbing)) return;
    const recordedVelocity = Math.max(0.05, Math.min(1, playedVelocity * state.recGain));
    const overdubMode = state.isOverdubbing && !state.isRecording;
    set((s) => {
      const bankPattern = s.patterns[s.activeBank];
      const stepIndex = s.currentStep;
      const updatedPads = bankPattern.pads.map((p) => {
        if (p.padId !== bankPadIndex) return p;
        const newSteps = [...p.steps];
        const existing = newSteps[stepIndex];
        if (overdubMode && existing.active) return p; // overdub only adds new notes
        newSteps[stepIndex] = { active: true, velocity: recordedVelocity };
        return { ...p, steps: newSteps };
      });
      return {
        patterns: {
          ...s.patterns,
          [s.activeBank]: { ...bankPattern, pads: updatedPads }
        }
      };
    });
  };

  // --- Scheduler ---
  const scheduleStepEvents = (step: number, time: number) => {
    const state = get();
    const swingDelaySeconds = getSwingDelayMs(step, state.bpm, state.swing) / 1000;

    if (state.metronome && step % 4 === 0) {
      audioEngine.triggerPad(null, { type: 'hihat', decay: 0.03 }, 0.5, 12, 0, 0, 1.0, undefined, time);
    }

    const bankPads = state.banks[state.activeBank];
    const soloActive = hasSoloPad(bankPads);
    const pattern = state.patterns[state.activeBank];

    pattern.pads.forEach((padPattern) => {
      const stepEvent = padPattern.steps[step];
      if (!stepEvent || !stepEvent.active) return;
      const pad = bankPads[padPattern.padId];
      if (!pad) return;
      const padKey = `${state.activeBank}-${padPattern.padId}`;
      const sampleState = state.padSampleState[padKey]?.status ?? 'idle';
      if ((pad.audioUrl || pad.sampleId) && sampleState !== 'loaded') return; // never silently fall back while a sample is missing
      if (!shouldPlayPad(pad, soloActive)) return;
      audioEngine.triggerPad(
        pad.audioBuffer || null,
        pad.synthParams,
        pad.volume,
        pad.pitch,
        pad.pan,
        pad.chokeGroup,
        stepEvent.velocity,
        padKey,
        time + swingDelaySeconds,
        { start: pad.sampleStart, end: pad.sampleEnd }
      );
    });
  };

  const schedulerTick = () => {
    const state = get();
    if (!state.isPlaying) return;
    let ctx: AudioContext;
    try {
      ctx = audioEngine.getContext();
    } catch {
      return;
    }

    const stepDuration = 60 / Math.max(1, state.bpm) / 4;
    if (nextStepTime <= 0 || nextStepTime < ctx.currentTime - 0.1) {
      // The scheduler just started or the tab was throttled: resync instead of
      // firing a burst of stale events.
      nextStepTime = ctx.currentTime + 0.04;
      uiStepQueue = [];
    }
    while (nextStepTime < ctx.currentTime + LOOKAHEAD_SECONDS) {
      scheduleStepEvents(scheduleStepIndex, nextStepTime);
      uiStepQueue.push({ step: scheduleStepIndex, time: nextStepTime });
      scheduleStepIndex = (scheduleStepIndex + 1) % 16;
      nextStepTime += stepDuration;
    }

    while (uiStepQueue.length > 0 && uiStepQueue[0].time <= ctx.currentTime + 0.005) {
      const due = uiStepQueue.shift()!;
      if (get().isPlaying) set({ currentStep: due.step });
    }
  };

  const startScheduler = () => {
    if (schedulerTimer !== null) {
      // Defensive: never allow overlapping scheduler loops.
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
    scheduleStepIndex = 0;
    uiStepQueue = [];
    nextStepTime = 0;
    try {
      const ctx = audioEngine.getContext();
      if (typeof ctx.currentTime === 'number') nextStepTime = ctx.currentTime + 0.06;
    } catch {
      // AudioContext unavailable (no user gesture yet): the first tick will retry.
      nextStepTime = 0;
    }
    schedulerTimer = window.setInterval(schedulerTick, SCHEDULER_TICK_MS);
    schedulerTick();
  };

  const stopScheduler = () => {
    if (schedulerTimer !== null) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
    uiStepQueue = [];
    // Cancel anything scheduled ahead of time (including swing-delayed events).
    audioEngine.stopScheduledEvents();
  };

  return {
    activeBank: 'A',
    viewMode: 'MAIN',
    selectedPadIndex: 0,

    bpm: 107,
    swing: 0,
    masterVolume: 0.85,
    recGain: 0.7,
    noteVariation: 100,
    metronome: false,

    isPlaying: false,
    isRecording: false,
    isOverdubbing: false,
    currentStep: 0,

    projectId: 'default-project',
    projectName: 'MPC SESSION',
    projectArtist: '',
    saveStatus: 'idle',
    lastSaveError: null,
    activePresetId: 'kit1',
    kitLoadStatus: 'idle',
    kitLoadError: null,
    projectLoadStatus: 'idle',
    projectLoadError: null,
    canUndo: false,
    canRedo: false,
    customKitNames: {
      kit1: 'FATHER',
      kit2: 'RUNAWAY',
      synth808: 'SAMPLE'
    },

    padSampleState: emptySampleStates(),
    sampleUpload: { status: 'idle', message: '' },

    banks: initialBanks,
    patterns: initialPatterns,
    activeTriggeredPads: {},

    isInfoActive: false,
    toggleInfoMode: () => set((s) => ({ isInfoActive: !s.isInfoActive })),

    isCameraActive: false,
    gestureTargetPad: 0,
    cameraPermissionState: 'prompt',

    setActiveBank: (bank) => set({ activeBank: bank }),
    setViewMode: (mode) => set({ viewMode: mode }),
    setSelectedPadIndex: (index) => set({ selectedPadIndex: index }),

    toggleCamera: () => set((state) => ({ isCameraActive: !state.isCameraActive })),
    setGestureTargetPad: (index) => set({ gestureTargetPad: index }),
    setCameraPermissionState: (state) => set({ cameraPermissionState: state }),

    setBpm: (bpm) => {
      const clampedBpm = Math.max(40, Math.min(240, Math.round(bpm)));
      set({ bpm: clampedBpm });
      // The scheduler reads BPM on every tick, so playback continues seamlessly.
    },

    setSwing: (swing) => set({ swing: Math.max(0, Math.min(100, swing)) }),

    setMasterVolume: (vol) => {
      const clamped = Math.max(0, Math.min(1, vol));
      set({ masterVolume: clamped });
      audioEngine.setMasterVolume(clamped);
    },

    setRecGain: (gain) => set({ recGain: Math.max(0, Math.min(1, gain)) }),

    setNoteVariation: (val) => set({ noteVariation: Math.max(0, Math.min(100, val)) }),

    toggleMetronome: () => set((state) => ({ metronome: !state.metronome })),

    triggerPad: (bankPadIndex, velocityOverride) => {
      const state = get();
      const pad = state.banks[state.activeBank][bankPadIndex];
      if (!pad) return;

      const velModifier = (state.noteVariation / 100);
      const finalVel = Math.max(0, Math.min(1, (velocityOverride ?? 1.0) * velModifier));
      const padKey = `${state.activeBank}-${bankPadIndex}`;

      const sampleStatus = state.padSampleState[padKey]?.status ?? 'idle';
      const sampleMissing = Boolean(pad.audioUrl || pad.sampleId) && sampleStatus !== 'loaded';
      const soloActive = hasSoloPad(state.banks[state.activeBank]);
      const audible = shouldPlayPad(pad, soloActive) && !sampleMissing;

      if (audible) {
        audioEngine.triggerPad(
          pad.audioBuffer || null,
          pad.synthParams,
          pad.volume,
          pad.pitch,
          pad.pan,
          pad.chokeGroup,
          finalVel,
          padKey,
          undefined,
          { start: pad.sampleStart, end: pad.sampleEnd }
        );
      }

      if (state.isPlaying && (state.isRecording || state.isOverdubbing)) {
        recordPadHit(bankPadIndex, finalVel);
      }

      set((s) => ({
        selectedPadIndex: bankPadIndex,
        activeTriggeredPads: { ...s.activeTriggeredPads, [bankPadIndex]: true }
      }));

      setTimeout(() => {
        set((s) => {
          const updated = { ...s.activeTriggeredPads };
          delete updated[bankPadIndex];
          return { activeTriggeredPads: updated };
        });
      }, 120);
    },

    renamePad: (bankId, bankPadIndex, name) => {
      get().updatePad(bankId, bankPadIndex, { name });
    },

    renameKit: (kitId, name) => {
      set((s) => ({
        customKitNames: { ...s.customKitNames, [kitId]: name },
        projectName: s.activePresetId === kitId ? name : s.projectName
      }));
    },

    updatePad: (bankId, bankPadIndex, updates) => {
      const updateKeys = Object.keys(updates).sort().join('|');
      rememberMusicalEdit(`pad:${bankId}:${bankPadIndex}:${updateKeys}`);
      set((state) => {
        const bankPads = [...state.banks[bankId]];
        bankPads[bankPadIndex] = { ...bankPads[bankPadIndex], ...updates };
        return {
          banks: { ...state.banks, [bankId]: bankPads }
        };
      });
      if (typeof updates.volume === 'number') {
        // Live-update already-sounding voices so the fader responds immediately.
        audioEngine.setPadVoiceVolume(`${bankId}-${bankPadIndex}`, updates.volume);
      }
    },

    togglePadMute: (bankId, bankPadIndex) => {
      const pad = get().banks[bankId][bankPadIndex];
      if (!pad) return;
      get().updatePad(bankId, bankPadIndex, { isMuted: !pad.isMuted });
      syncRouting(get().banks);
    },

    togglePadSolo: (bankId, bankPadIndex) => {
      const pad = get().banks[bankId][bankPadIndex];
      if (!pad) return;
      get().updatePad(bankId, bankPadIndex, { isSolo: !pad.isSolo });
      syncRouting(get().banks);
    },

    assignSynthToPad: (bankId, bankPadIndex, synthType, name) => {
      get().updatePad(bankId, bankPadIndex, {
        name,
        audioBuffer: null,
        audioUrl: undefined,
        sampleId: undefined,
        synthParams: { type: synthType }
      });
      setPadStatus(`${bankId}-${bankPadIndex}`, 'idle');
    },

    uploadSampleToPad: async (bankId, bankPadIndex, file) => {
      const padKey = `${bankId}-${bankPadIndex}`;
      const failUpload = (message: string) => {
        set({ sampleUpload: { status: 'error', message, padKey } });
      };

      const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
      if (!file.type.startsWith('audio/') && !SUPPORTED_AUDIO_EXTENSIONS.includes(extension)) {
        failUpload(`"${file.name}" is not a supported audio file. Use WAV, MP3, OGG, M4A, or FLAC.`);
        return;
      }
      if (file.size === 0) {
        failUpload(`"${file.name}" is empty.`);
        return;
      }
      if (file.size > MAX_SAMPLE_BYTES) {
        failUpload(`"${file.name}" is larger than ${Math.round(MAX_SAMPLE_BYTES / (1024 * 1024))} MB.`);
        return;
      }

      set({ sampleUpload: { status: 'decoding', message: `Decoding ${file.name}...`, padKey } });

      let arrayBuffer: ArrayBuffer;
      let decodedBuffer: AudioBuffer;
      try {
        arrayBuffer = await file.arrayBuffer();
      } catch {
        failUpload(`Could not read "${file.name}".`);
        return;
      }
      try {
        decodedBuffer = await audioEngine.decodeArrayBuffer(arrayBuffer);
      } catch {
        failUpload(`"${file.name}" could not be decoded. The format may be unsupported or the file may be corrupt.`);
        return;
      }

      set({ sampleUpload: { status: 'saving', message: `Saving ${file.name}...`, padKey } });

      const sampleId = `user-sample-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      let persistWarning: string | null = null;
      try {
        await saveSampleBlobToDB(sampleId, file.name, file.type, arrayBuffer);
      } catch (err) {
        // The pad still works for this session, but the user must know it will not survive a refresh.
        persistWarning = `Loaded for this session only — local storage failed (${describeError(err, 'quota exceeded')}).`;
      }

      audioEngine.registerBuffer(sampleId, decodedBuffer);
      const padName = file.name.replace(/\.[^/.]+$/, '').substring(0, 12);
      get().updatePad(bankId, bankPadIndex, {
        name: padName,
        sampleId,
        audioBuffer: decodedBuffer,
        audioUrl: undefined,
        synthParams: { type: 'none' },
        sampleStart: 0,
        sampleEnd: undefined,
      });
      setPadStatus(padKey, 'loaded');

      set({
        sampleUpload: {
          status: 'success',
          message: persistWarning ?? `"${file.name}" assigned to pad ${KEY_LABELS[bankPadIndex]}.`,
          padKey,
        }
      });
    },

    reloadPadSample: async (bankId, bankPadIndex) => {
      const pad = get().banks[bankId]?.[bankPadIndex];
      if (!pad || (!pad.sampleId && !pad.audioUrl)) return;
      const key = `${bankId}-${bankPadIndex}`;
      setPadStatus(key, 'loading');
      try {
        const buffer = await loadPadSample(pad);
        const current = get().banks[bankId]?.[bankPadIndex];
        if (!current || current.sampleId !== pad.sampleId || current.audioUrl !== pad.audioUrl) return;
        current.audioBuffer = buffer;
        setPadStatus(key, 'loaded');
        set((s) => ({ banks: { ...s.banks, [bankId]: [...s.banks[bankId]] } }));
      } catch (err) {
        setPadStatus(key, 'failed', describeError(err, 'Sample failed to load'));
      }
    },

    toggleStep: (bankPadIndex, stepIndex) => {
      rememberMusicalEdit();
      set((state) => {
        const bankPattern = state.patterns[state.activeBank];
        const updatedPads = bankPattern.pads.map((p) => {
          if (p.padId === bankPadIndex) {
            const newSteps = [...p.steps];
            const currentActive = newSteps[stepIndex].active;
            newSteps[stepIndex] = {
              active: !currentActive,
              velocity: currentActive ? 0.9 : 0.95
            };
            return { ...p, steps: newSteps };
          }
          return p;
        });
        return {
          patterns: {
            ...state.patterns,
            [state.activeBank]: { ...bankPattern, pads: updatedPads }
          }
        };
      });
    },

    setStepVelocity: (bankPadIndex, stepIndex, velocity) => {
      rememberMusicalEdit();
      const clamped = Math.max(0.1, Math.min(1, velocity));
      set((state) => {
        const bankPattern = state.patterns[state.activeBank];
        const updatedPads = bankPattern.pads.map((p) => {
          if (p.padId === bankPadIndex) {
            const newSteps = [...p.steps];
            newSteps[stepIndex] = { ...newSteps[stepIndex], velocity: clamped };
            return { ...p, steps: newSteps };
          }
          return p;
        });
        return {
          patterns: {
            ...state.patterns,
            [state.activeBank]: { ...bankPattern, pads: updatedPads }
          }
        };
      });
    },

    clearBankPattern: (bankId) => {
      rememberMusicalEdit(`clear:${bankId}`);
      set((state) => ({
        patterns: {
          ...state.patterns,
          [bankId]: createEmptyPattern(bankId)
        }
      }));
    },

    undo: () => {
      const previous = undoStack.pop();
      if (!previous) return;
      redoStack.push(createMusicalSnapshot(get().banks, get().patterns));
      lastEditKey = null;
      restoreMusicalSnapshot(cloneMusicalSnapshot(previous));
      set({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
    },

    redo: () => {
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(createMusicalSnapshot(get().banks, get().patterns));
      lastEditKey = null;
      restoreMusicalSnapshot(cloneMusicalSnapshot(next));
      set({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
    },

    togglePlay: () => {
      const state = get();
      if (state.isPlaying) {
        get().stopPlayback();
        return;
      }
      set({ isPlaying: true, currentStep: 0 });
      startScheduler();
    },

    stopPlayback: () => {
      stopScheduler();
      set({ isPlaying: false, isRecording: false, isOverdubbing: false, currentStep: 0 });
    },

    stopAllPlayback: () => {
      audioEngine.stopAllPlayback();
      get().stopPlayback();
    },

    toggleRecord: () => {
      const state = get();
      if (!state.isPlaying) {
        rememberMusicalEdit();
        set({ isRecording: true, isOverdubbing: false, currentStep: 0 });
        get().togglePlay();
      } else if (state.isRecording) {
        set({ isRecording: false });
      } else {
        rememberMusicalEdit();
        set({ isRecording: true, isOverdubbing: false });
      }
    },

    toggleOverdub: () => {
      const state = get();
      if (!state.isPlaying) {
        rememberMusicalEdit();
        set({ isOverdubbing: true, isRecording: false, currentStep: 0 });
        get().togglePlay();
      } else if (state.isOverdubbing) {
        set({ isOverdubbing: false });
      } else {
        rememberMusicalEdit();
        set({ isOverdubbing: true, isRecording: false });
      }
    },

    loadPresetKit: async (kitId) => {
      const preset = PRESET_KITS[kitId];
      if (!preset) return;
      const requestId = ++kitLoadRequest;
      const guard = () => requestId === kitLoadRequest;
      set({ kitLoadStatus: 'loading', kitLoadError: null, projectLoadStatus: 'idle', projectLoadError: null });

      const newBanks: Record<BankId, PadConfig[]> = {
        A: createEmptyBank('A'),
        B: createEmptyBank('B'),
        C: createEmptyBank('C'),
        D: createEmptyBank('D'),
      };

      const statuses: Record<string, PadSampleState> = emptySampleStates();
      const loadJobs: Array<{ key: string; pad: PadConfig }> = [];

      for (const bKey of BANK_KEYS) {
        const presetBankPads = preset.banks[bKey] || [];
        presetBankPads.forEach((pConfig) => {
          const idx = pConfig.bankPadIndex ?? 0;
          newBanks[bKey][idx] = {
            ...newBanks[bKey][idx],
            ...pConfig,
          };
        });

        for (const pad of newBanks[bKey]) {
          const key = `${bKey}-${pad.bankPadIndex}`;
          if (pad.audioUrl) {
            statuses[key] = { status: 'loading', error: null };
            loadJobs.push({ key, pad });
          }
        }
      }

      // Publish the new pad layout immediately so loading states are visible per pad.
      if (guard()) {
        set({ banks: newBanks, padSampleState: { ...get().padSampleState, ...statuses } });
        syncRouting(newBanks);
      }

      let loadedSamples = 0;
      let failedSamples = 0;
      const failures: string[] = [];

      await mapWithLimit(loadJobs, SAMPLE_LOAD_CONCURRENCY, async ({ key, pad }) => {
        try {
          const buffer = await audioEngine.loadAudioFromUrl(pad.audioUrl!);
          pad.audioBuffer = buffer;
          loadedSamples += 1;
          setPadStatus(key, 'loaded', null, guard);
        } catch (err) {
          pad.audioBuffer = null;
          const message = describeError(err, 'Sample failed to load');
          failedSamples += 1;
          failures.push(message);
          setPadStatus(key, 'failed', message, guard);
        }
      });

      if (!guard()) return; // a newer kit selection superseded this request

      // Fresh patterns per kit load: a shallow copy of the shared initial
      // patterns would let one kit's demo steps leak into every other kit.
      const demoPatterns: Record<BankId, BankPattern> = {
        A: createEmptyPattern('A'),
        B: createEmptyPattern('B'),
        C: createEmptyPattern('C'),
        D: createEmptyPattern('D'),
      };
      if (kitId === 'kit1') {
        demoPatterns.A.pads[0].steps[0].active = true;
        demoPatterns.A.pads[0].steps[8].active = true;
        demoPatterns.A.pads[4].steps[4].active = true;
        demoPatterns.A.pads[4].steps[12].active = true;
        demoPatterns.A.pads[8].steps[0].active = true;
        demoPatterns.A.pads[10].steps[2].active = true;
        demoPatterns.A.pads[10].steps[10].active = true;
      } else if (kitId === 'kit2') {
        demoPatterns.A.pads[0].steps[0].active = true;
        demoPatterns.A.pads[0].steps[2].active = true;
        demoPatterns.A.pads[0].steps[4].active = true;
        demoPatterns.A.pads[0].steps[6].active = true;
        demoPatterns.A.pads[1].steps[8].active = true;
        demoPatterns.A.pads[2].steps[10].active = true;
        demoPatterns.A.pads[3].steps[12].active = true;
        demoPatterns.A.pads[8].steps[0].active = true;
      }

      const requestedSamples = loadJobs.length;
      const kitDisplayName = get().customKitNames[preset.id] || preset.name;
      set({
        projectId: 'default-project',
        projectName: kitDisplayName,
        projectArtist: preset.artist,
        bpm: preset.bpm,
        activePresetId: preset.id,
        banks: newBanks,
        patterns: demoPatterns,
        currentStep: 0,
        kitLoadStatus: requestedSamples === 0
          ? 'ready'
          : failedSamples === 0
            ? 'ready'
            : loadedSamples === 0
              ? 'failed'
              : 'partial',
        kitLoadError: failedSamples === 0
          ? null
          : `${failedSamples} of ${requestedSamples} samples failed to load${failures[0] ? ` (${failures[0]})` : ''}`,
      });
      audioEngine.setMasterVolume(get().masterVolume);
      writeLastSession({ kind: 'kit', id: preset.id });
    },

    saveCurrentProject: async (name) => {
      const state = get();
      const projName = name || state.projectName;
      const now = Date.now();
      const project: ProjectData = {
        id: state.projectId || 'default-project',
        name: projName,
        artist: state.projectArtist,
        bpm: state.bpm,
        swing: state.swing,
        masterVolume: state.masterVolume,
        activeBank: state.activeBank,
        banks: state.banks,
        patterns: state.patterns,
        createdAt: now,
        updatedAt: now,
      };
      const localProject: ProjectData = {
        ...project,
        banks: Object.fromEntries(Object.entries(project.banks).map(([bank, pads]) => [bank, pads.map(({ audioBuffer: _audioBuffer, ...pad }) => pad)])) as ProjectData['banks']
      };
      try {
        const cloudProject = await saveCloudProject(project);
        try { await saveProjectToDB({ ...cloudProject, banks: localProject.banks }); } catch { /* cloud is authoritative after success */ }
        set({ projectId: cloudProject.id, projectName: projName, saveStatus: 'cloud-success', lastSaveError: null });
        writeLastSession({ kind: 'project', id: cloudProject.id });
        return 'cloud-success';
      } catch (cloudError) {
        try {
          await saveProjectToDB(localProject);
          const message = cloudError instanceof Error ? cloudError.message : 'Cloud project unavailable';
          set({ projectName: projName, saveStatus: 'local-only', lastSaveError: message });
          writeLastSession({ kind: 'project', id: localProject.id });
          return 'local-only';
        } catch (localError) {
          const message = localError instanceof Error ? localError.message : 'Local project save failed';
          set({ saveStatus: 'failed', lastSaveError: message });
          return 'failed';
        }
      }
    },

    loadProjectFromStorage: async (project) => {
      const requestId = ++projectLoadRequest;
      const guard = () => requestId === projectLoadRequest;
      set({
        projectLoadStatus: 'loading',
        projectLoadError: null,
        kitLoadStatus: 'idle',
        kitLoadError: null,
      });

      const banks = {} as Record<BankId, PadConfig[]>;
      const statuses: Record<string, PadSampleState> = emptySampleStates();
      for (const bKey of BANK_KEYS) {
        banks[bKey] = (project.banks[bKey] ?? createEmptyBank(bKey)).map((pad) => ({ ...pad, audioBuffer: null }));
      }

      const loadJobs: Array<{ bankId: BankId; pad: PadConfig; key: string }> = [];
      for (const bKey of BANK_KEYS) {
        for (const pad of banks[bKey]) {
          if (pad.sampleId || pad.audioUrl) {
            const key = `${bKey}-${pad.bankPadIndex}`;
            statuses[key] = { status: 'loading', error: null };
            loadJobs.push({ bankId: bKey, pad, key });
          }
        }
      }

      // Commit project metadata and pattern data right away; audio fills in progressively.
      if (!guard()) return;
      set({
        projectId: project.id,
        projectName: project.name,
        projectArtist: project.artist,
        bpm: project.bpm,
        swing: project.swing,
        masterVolume: project.masterVolume,
        activeBank: project.activeBank,
        banks,
        patterns: project.patterns,
        currentStep: 0,
        padSampleState: { ...get().padSampleState, ...statuses },
      });
      audioEngine.setMasterVolume(project.masterVolume);
      syncRouting(banks);
      writeLastSession({ kind: 'project', id: project.id });

      await mapWithLimit(loadJobs, SAMPLE_LOAD_CONCURRENCY, async ({ pad, key }) => {
        try {
          const buffer = await loadPadSample(pad);
          if (!guard()) return;
          pad.audioBuffer = buffer;
          setPadStatus(key, 'loaded', null, guard);
        } catch (err) {
          if (!guard()) return;
          pad.audioBuffer = null;
          setPadStatus(key, 'failed', describeError(err, 'Sample failed to load'), guard);
        }
      });

      if (!guard()) return;
      const failed = loadJobs.filter(({ key }) => get().padSampleState[key]?.status === 'failed').length;
      set({
        projectLoadStatus: 'idle',
        projectLoadError: null,
        kitLoadStatus: loadJobs.length === 0 ? 'ready' : failed === 0 ? 'ready' : failed === loadJobs.length ? 'failed' : 'partial',
        kitLoadError: failed > 0 ? `${failed} saved sample${failed === 1 ? '' : 's'} could not be restored` : null,
      });
    },

    restoreSession: async () => {
      const last = readLastSession();
      try {
        if (!last) {
          await get().loadPresetKit('kit1');
          return;
        }
        if (last.kind === 'kit') {
          await get().loadPresetKit(PRESET_KITS[last.id] ? last.id : 'kit1');
          return;
        }
        // Prefer the local copy (fast, offline-capable), then fall back to the cloud.
        try {
          const localProjects = await loadProjectsFromDB();
          const local = localProjects.find((candidate) => candidate.id === last.id);
          if (local) {
            await get().loadProjectFromStorage(local);
            return;
          }
        } catch { /* fall through to cloud */ }
        try {
          const cloudProject = await loadCloudProject(last.id);
          await get().loadProjectFromStorage(cloudProject);
          return;
        } catch { /* fall through to default kit */ }
        await get().loadPresetKit('kit1');
      } catch {
        if (get().kitLoadStatus === 'idle' && get().projectLoadStatus !== 'loading') {
          await get().loadPresetKit('kit1').catch(() => undefined);
        }
      }
    },
  };
});
