import type { BankId, PadConfig, ProjectData, SynthParams } from '../../types';
import { encodePcmWav } from './wavEncoder';
import { getSwingDelayMs, hasSoloPad, shouldPlayPad } from './padRouting';

export type ExportProgress = (completedSteps: number, totalSteps: number) => void;

type Stoppable = { stop(when: number): void };

function createNoiseBuffer(context: BaseAudioContext, duration: number): AudioBuffer {
  const bufferSize = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) output[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Offline twin of AudioEngine.triggerSynthSound. Schedules the same voice
 * structures (noise-based snare/hihat/clap, enveloped oscillators for the
 * tonal voices) so exported synth sounds match what is heard live.
 */
function scheduleSynth(
  context: BaseAudioContext,
  params: SynthParams,
  time: number,
  destination: AudioNode,
  velocity: number,
  pitch: number,
  chokeGroup: number,
  chokeRegistry: Map<number, Stoppable[]>
): Stoppable[] {
  const created: Stoppable[] = [];
  if (params.type === 'none') return created;
  const pitchRatio = Math.pow(2, pitch / 12);
  const clampEnv = (value: number) => Math.max(0.0001, Math.min(1, value));

  const register = (source: Stoppable) => {
    created.push(source);
    if (chokeGroup > 0) {
      if (!chokeRegistry.has(chokeGroup)) chokeRegistry.set(chokeGroup, []);
      chokeRegistry.get(chokeGroup)!.push(source);
    }
  };

  const decayOf = (fallback: number) => Math.max(0.02, params.decay ?? fallback);

  switch (params.type) {
    case 'kick': {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const decay = decayOf(0.4);
      osc.frequency.setValueAtTime((params.frequency || 150) * pitchRatio, time);
      osc.frequency.exponentialRampToValueAtTime(0.001, time + decay);
      gain.gain.setValueAtTime(clampEnv(velocity), time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
      osc.connect(gain).connect(destination);
      osc.start(time);
      osc.stop(time + decay);
      register(osc);
      break;
    }
    case 'snare': {
      const decay = decayOf(0.25);
      const noiseSource = context.createBufferSource();
      noiseSource.buffer = createNoiseBuffer(context, 0.3);
      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime((params.noiseFilter || 800) * pitchRatio, time);
      const noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime(clampEnv(velocity * 0.8), time);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, time + decay);
      noiseSource.connect(filter).connect(noiseGain).connect(destination);
      noiseSource.start(time);
      noiseSource.stop(time + decay);

      const body = context.createOscillator();
      body.type = 'triangle';
      body.frequency.setValueAtTime(180 * pitchRatio, time);
      body.frequency.exponentialRampToValueAtTime(0.01, time + 0.15);
      const bodyGain = context.createGain();
      bodyGain.gain.setValueAtTime(clampEnv(velocity * 0.7), time);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      body.connect(bodyGain).connect(destination);
      body.start(time);
      body.stop(time + 0.15);

      register(noiseSource);
      register(body);
      break;
    }
    case 'hihat': {
      const decay = decayOf(0.08);
      const noiseSource = context.createBufferSource();
      noiseSource.buffer = createNoiseBuffer(context, 0.15);
      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(7000 * pitchRatio, time);
      const gain = context.createGain();
      gain.gain.setValueAtTime(clampEnv(velocity * 0.6), time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
      noiseSource.connect(filter).connect(gain).connect(destination);
      noiseSource.start(time);
      noiseSource.stop(time + decay + 0.02);
      register(noiseSource);
      break;
    }
    case 'clap': {
      const decay = decayOf(0.3);
      const noiseSource = context.createBufferSource();
      noiseSource.buffer = createNoiseBuffer(context, decay);
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200 * pitchRatio, time);
      filter.Q.setValueAtTime(3, time);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.setValueAtTime(clampEnv(velocity * 0.8), time + 0.01);
      gain.gain.setValueAtTime(clampEnv(velocity * 0.1), time + 0.02);
      gain.gain.setValueAtTime(clampEnv(velocity * 0.9), time + 0.03);
      gain.gain.setValueAtTime(clampEnv(velocity * 0.1), time + 0.04);
      gain.gain.setValueAtTime(clampEnv(velocity * 0.7), time + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
      noiseSource.connect(filter).connect(gain).connect(destination);
      noiseSource.start(time);
      noiseSource.stop(time + decay);
      register(noiseSource);
      break;
    }
    default: {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const decay = decayOf(0.5);
      if (params.type === 'subbass') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime((params.frequency || 55) * pitchRatio, time);
        gain.gain.setValueAtTime(clampEnv(velocity * 0.9), time);
      } else if (params.type === 'lead') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime((params.frequency || 220) * pitchRatio, time);
        gain.gain.setValueAtTime(clampEnv(velocity * 0.5), time);
      } else if (params.type === 'piano') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime((params.frequency || 330) * pitchRatio, time);
        gain.gain.setValueAtTime(clampEnv(velocity * 0.8), time);
      } else {
        // tom
        osc.type = 'sine';
        osc.frequency.setValueAtTime((params.frequency || 120) * pitchRatio, time);
        osc.frequency.exponentialRampToValueAtTime(40, time + decay);
        gain.gain.setValueAtTime(clampEnv(velocity * 0.8), time);
      }
      gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
      osc.connect(gain).connect(destination);
      osc.start(time);
      osc.stop(time + decay);
      register(osc);
      break;
    }
  }
  return created;
}

function countActiveSteps(project: ProjectData): number {
  let count = 0;
  for (const bank of ['A', 'B', 'C', 'D'] as BankId[]) {
    for (const padPattern of project.patterns[bank]?.pads ?? []) {
      for (const step of padPattern.steps ?? []) {
        if (step.active) count += 1;
      }
    }
  }
  return count;
}

export interface WavExportOptions {
  /**
   * Per-pad sample load state keyed `${bank}-${padIndex}`. Pads whose sample
   * failed to load (or is still loading) are skipped instead of silently
   * falling back to a synthesized voice — matching live playback behavior.
   */
  padSampleState?: Record<string, { status: string }>;
}

/**
 * Render the sequenced performance (all banks' patterns) to a PCM WAV blob,
 * matching live playback: swing timing, per-pad volume/pitch/pan, mute/solo,
 * sample start/end trim, choke groups, and master gain.
 */
export async function renderProjectToWav(
  project: ProjectData,
  onProgress: ExportProgress = () => undefined,
  options: WavExportOptions = {}
): Promise<Blob> {
  const OfflineContextClass = window.OfflineAudioContext;
  if (!OfflineContextClass) throw new Error('Offline audio rendering is not supported in this browser');

  const activeSteps = countActiveSteps(project);
  if (activeSteps === 0) {
    throw new Error('Nothing to export: the pattern has no active steps. Add steps in the sequencer first.');
  }

  const bankIds: BankId[] = ['A', 'B', 'C', 'D'];
  const stepsPerBar = 16;
  const totalSteps = stepsPerBar * 2;
  const stepSeconds = 60 / Math.max(1, project.bpm) / 4;
  const tailSeconds = 1.5;
  const sampleRate = 44100;
  const frameCount = Math.ceil((totalSteps * stepSeconds + tailSeconds) * sampleRate);

  const context = new OfflineContextClass(2, frameCount, sampleRate);
  const master = context.createGain();
  master.gain.value = Math.max(0, Math.min(1, project.masterVolume));
  master.connect(context.destination);

  const allPads = bankIds.flatMap((bank) => project.banks[bank] ?? []);
  const anySolo = hasSoloPad(allPads);
  const chokeRegistry = new Map<number, Stoppable[]>();

  const scheduleBufferSource = (
    buffer: AudioBuffer,
    pad: PadConfig,
    velocity: number,
    time: number,
    destination: AudioNode
  ) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = Math.pow(2, pad.pitch / 12);
    const startFraction = Math.max(0, Math.min(1, pad.sampleStart ?? 0));
    const hasEnd = pad.sampleEnd !== undefined && pad.sampleEnd > startFraction;
    const offset = startFraction * buffer.duration;
    const region = hasEnd ? Math.max(0.01, (pad.sampleEnd! - startFraction) * buffer.duration) : undefined;
    if (region !== undefined) source.start(time, offset, region);
    else source.start(time, offset);
    source.connect(destination);
    if (pad.chokeGroup > 0) {
      if (!chokeRegistry.has(pad.chokeGroup)) chokeRegistry.set(pad.chokeGroup, []);
      chokeRegistry.get(pad.chokeGroup)!.push(source);
    }
  };

  let completed = 0;
  for (let step = 0; step < totalSteps; step += 1) {
    const swingDelay = getSwingDelayMs(step, project.bpm, project.swing) / 1000;
    const time = step * stepSeconds + swingDelay;

    for (const bank of bankIds) {
      const pattern = project.patterns[bank];
      if (!pattern) continue;
      for (const padPattern of pattern.pads) {
        const event = padPattern.steps[step % stepsPerBar];
        const pad = project.banks[bank]?.[padPattern.padId];
        if (!event?.active || !pad) continue;
        if (!shouldPlayPad(pad, anySolo)) continue;
        const padSampleStatus = options.padSampleState?.[`${bank}-${padPattern.padId}`]?.status ?? 'idle';
        if ((pad.audioUrl || pad.sampleId) && padSampleStatus !== 'loaded') continue;

        const velocity = Math.max(0, Math.min(1, event.velocity));
        const previousInGroup = pad.chokeGroup > 0 ? [...(chokeRegistry.get(pad.chokeGroup) ?? [])] : [];
        const padGain = context.createGain();
        padGain.gain.value = Math.max(0.001, Math.min(1, pad.volume * velocity));

        let output: AudioNode = padGain;
        if (typeof context.createStereoPanner === 'function') {
          const panner = context.createStereoPanner();
          panner.pan.value = Math.max(-1, Math.min(1, pad.pan));
          padGain.connect(panner);
          output = panner;
        }
        output.connect(master);

        if (pad.audioBuffer) {
          scheduleBufferSource(pad.audioBuffer, pad, velocity, time, padGain);
        } else if (pad.synthParams && pad.synthParams.type !== 'none') {
          scheduleSynth(context, pad.synthParams, time, padGain, velocity, pad.pitch, pad.chokeGroup, chokeRegistry);
        }

        // Choke: a later event in the same group silences the earlier voices,
        // while keeping this event's own voices registered for future hits.
        if (pad.chokeGroup > 0) {
          const current = chokeRegistry.get(pad.chokeGroup) ?? [];
          const registeredNow = current.slice(previousInGroup.length);
          for (const previous of previousInGroup) {
            try {
              previous.stop(time);
            } catch {
              // ignore voices that cannot be stopped at this time
            }
          }
          chokeRegistry.set(pad.chokeGroup, registeredNow);
        }
      }
    }

    completed += 1;
    onProgress(completed, totalSteps);
    // Yield so progress updates can paint.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const rendered = await context.startRendering();
  const wav = encodePcmWav(rendered);
  return new Blob([wav], { type: 'audio/wav' });
}
