import { create } from 'zustand';
import { BankId, BankPattern, PadConfig, ProjectData, ViewMode } from '../types';
import { audioEngine } from '../services/audio/AudioEngine';
import { createEmptyBank, PRESET_KITS } from '../services/audio/presetKits';
import { saveProjectToDB, saveSampleBlobToDB } from '../services/db/storage';

interface MCPState {
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
  activePresetId: string;
  customKitNames: Record<string, string>;

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
  renamePad: (bankId: BankId, bankPadIndex: number, name: string) => void;
  renameKit: (kitId: string, name: string) => void;
  assignSynthToPad: (bankId: BankId, bankPadIndex: number, synthType: any, name: string) => void;
  uploadSampleToPad: (bankId: BankId, bankPadIndex: number, file: File) => Promise<void>;

  toggleStep: (bankPadIndex: number, stepIndex: number) => void;
  setStepVelocity: (bankPadIndex: number, stepIndex: number, velocity: number) => void;
  clearBankPattern: (bankId: BankId) => void;

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
  advanceStep: () => void;

  loadPresetKit: (kitId: string) => Promise<void>;
  saveCurrentProject: (name?: string) => Promise<void>;
  loadProjectFromStorage: (project: ProjectData) => Promise<void>;
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

export const useStore = create<MCPState>((set, get) => {
  let stepTimerId: number | null = null;

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
    projectName: 'MCP SESSION',
    projectArtist: '',
    activePresetId: 'kit1',
    customKitNames: {
      kit1: 'FATHER',
      kit2: 'RUNAWAY',
      synth808: 'SAMPLE'
    },

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
      if (get().isPlaying) {
        get().stopPlayback();
        get().togglePlay();
      }
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

      // Pad 14 (Index 13, Key N) -> Stop All Beats
      if (bankPadIndex === 13 || pad.name.toUpperCase() === 'STOP') {
        audioEngine.stopAllPlayback();
        get().stopPlayback();
      }

      // Pad 15 (Index 14, Key M) -> Camera Under Construction Notice
      if (bankPadIndex === 14 || pad.name.toUpperCase() === 'CAMERA') {
        set((s) => ({ isCameraActive: !s.isCameraActive }));
      }

      // Pad 16 (Index 15, Key L) -> Song Info Mode
      if (bankPadIndex === 15 || pad.name.toUpperCase() === 'INFO' || pad.name.toUpperCase() === 'SONG INFO') {
        set((s) => ({ isInfoActive: !s.isInfoActive }));
      }

      const velModifier = (state.noteVariation / 100);
      const finalVel = (velocityOverride ?? 1.0) * velModifier;
      const padKey = `${state.activeBank}-${bankPadIndex}`;

      audioEngine.triggerPad(
        pad.audioBuffer || null,
        pad.synthParams,
        pad.volume,
        pad.pitch,
        pad.pan,
        pad.chokeGroup,
        finalVel,
        padKey
      );

      if (state.isPlaying && (state.isRecording || state.isOverdubbing)) {
        get().toggleStep(bankPadIndex, state.currentStep);
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
      set((state) => {
        const bankPads = [...state.banks[bankId]];
        bankPads[bankPadIndex] = { ...bankPads[bankPadIndex], ...updates };
        return {
          banks: { ...state.banks, [bankId]: bankPads }
        };
      });
    },

    assignSynthToPad: (bankId, bankPadIndex, synthType, name) => {
      get().updatePad(bankId, bankPadIndex, {
        name,
        audioBuffer: null,
        audioUrl: undefined,
        synthParams: { type: synthType }
      });
    },

    uploadSampleToPad: async (bankId, bankPadIndex, file) => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const decodedBuffer = await audioEngine.decodeArrayBuffer(arrayBuffer);
        const sampleId = `user-sample-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

        await saveSampleBlobToDB(sampleId, file.name, file.type, arrayBuffer);
        audioEngine.registerBuffer(sampleId, decodedBuffer);

        get().updatePad(bankId, bankPadIndex, {
          name: file.name.replace(/\.[^/.]+$/, '').substring(0, 12),
          sampleId,
          audioBuffer: decodedBuffer,
          audioUrl: undefined,
          synthParams: { type: 'none' }
        });
      } catch (err) {
        console.error('Failed to upload sample to pad:', err);
      }
    },

    toggleStep: (bankPadIndex, stepIndex) => {
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
      set((state) => {
        const bankPattern = state.patterns[state.activeBank];
        const updatedPads = bankPattern.pads.map((p) => {
          if (p.padId === bankPadIndex) {
            const newSteps = [...p.steps];
            newSteps[stepIndex] = { ...newSteps[stepIndex], velocity };
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
      set((state) => ({
        patterns: {
          ...state.patterns,
          [bankId]: createEmptyPattern(bankId)
        }
      }));
    },

    togglePlay: () => {
      const state = get();
      if (state.isPlaying) {
        get().stopPlayback();
      } else {
        set({ isPlaying: true });
        const stepIntervalMs = (60 / state.bpm / 4) * 1000;
        stepTimerId = window.setInterval(() => {
          get().advanceStep();
        }, stepIntervalMs);
      }
    },

    stopPlayback: () => {
      if (stepTimerId !== null) {
        clearInterval(stepTimerId);
        stepTimerId = null;
      }
      set({ isPlaying: false, isRecording: false, isOverdubbing: false, currentStep: 0 });
    },

    stopAllPlayback: () => {
      audioEngine.stopAllPlayback();
      get().stopPlayback();
    },

    toggleRecord: () => {
      const state = get();
      if (!state.isPlaying) {
        set({ isRecording: true, isOverdubbing: false });
        get().togglePlay();
      } else {
        set({ isRecording: !state.isRecording, isOverdubbing: false });
      }
    },

    toggleOverdub: () => {
      const state = get();
      if (!state.isPlaying) {
        set({ isOverdubbing: true, isRecording: false });
        get().togglePlay();
      } else {
        set({ isOverdubbing: !state.isOverdubbing, isRecording: false });
      }
    },

    advanceStep: () => {
      const state = get();
      const nextStep = (state.currentStep + 1) % 16;
      set({ currentStep: nextStep });

      if (state.metronome && nextStep % 4 === 0) {
        audioEngine.triggerPad(null, { type: 'hihat', decay: 0.03 }, 0.5, 12, 0, 0, 1.0);
      }

      const pattern = state.patterns[state.activeBank];
      pattern.pads.forEach((padPattern) => {
        const step = padPattern.steps[nextStep];
        if (step && step.active) {
          const pad = state.banks[state.activeBank][padPattern.padId];
          if (pad) {
            audioEngine.triggerPad(
              pad.audioBuffer || null,
              pad.synthParams,
              pad.volume,
              pad.pitch,
              pad.pan,
              pad.chokeGroup,
              step.velocity
            );
          }
        }
      });
    },

    loadPresetKit: async (kitId) => {
      const preset = PRESET_KITS[kitId];
      if (!preset) return;

      const newBanks: Record<BankId, PadConfig[]> = {
        A: createEmptyBank('A'),
        B: createEmptyBank('B'),
        C: createEmptyBank('C'),
        D: createEmptyBank('D'),
      };

      for (const bKey of ['A', 'B', 'C', 'D'] as BankId[]) {
        const presetBankPads = preset.banks[bKey] || [];
        presetBankPads.forEach((pConfig) => {
          const idx = pConfig.bankPadIndex ?? 0;
          newBanks[bKey][idx] = {
            ...newBanks[bKey][idx],
            ...pConfig,
          };
        });

        for (const pad of newBanks[bKey]) {
          if (pad.audioUrl) {
            const buf = await audioEngine.loadAudioFromUrl(pad.audioUrl);
            if (buf) pad.audioBuffer = buf;
          }
        }
      }

      const demoPatterns = { ...initialPatterns };
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

      const kitDisplayName = get().customKitNames[preset.id] || preset.name;
      set({
        projectId: `${preset.id}-${Date.now()}`,
        projectName: kitDisplayName,
        projectArtist: preset.artist,
        bpm: preset.bpm,
        activePresetId: preset.id,
        banks: newBanks,
        patterns: demoPatterns,
        currentStep: 0
      });
    },

    saveCurrentProject: async (name) => {
      const state = get();
      const projName = name || state.projectName;
      const project: ProjectData = {
        id: state.projectId || `proj-${Date.now()}`,
        name: projName,
        artist: state.projectArtist,
        bpm: state.bpm,
        swing: state.swing,
        masterVolume: state.masterVolume,
        activeBank: state.activeBank,
        banks: state.banks,
        patterns: state.patterns,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveProjectToDB(project);
      set({ projectName: projName });
    },

    loadProjectFromStorage: async (project) => {
      set({
        projectId: project.id,
        projectName: project.name,
        projectArtist: project.artist,
        bpm: project.bpm,
        swing: project.swing,
        masterVolume: project.masterVolume,
        activeBank: project.activeBank,
        banks: project.banks,
        patterns: project.patterns,
      });

      for (const bKey of ['A', 'B', 'C', 'D'] as BankId[]) {
        for (const pad of project.banks[bKey]) {
          if (pad.audioUrl) {
            const buf = await audioEngine.loadAudioFromUrl(pad.audioUrl);
            if (buf) pad.audioBuffer = buf;
          }
        }
      }
    }
  };
});
