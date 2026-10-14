import type { BankId, ProjectData, SynthParams } from '../../types';
import { encodePcmWav } from './wavEncoder';

export type ExportProgress = (completedSteps: number, totalSteps: number) => void;

function scheduleSynth(context: OfflineAudioContext, params: SynthParams, time: number, duration: number, destination: AudioNode, velocity: number) {
  if (params.type === 'none') return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const frequencies: Record<string, number> = { kick: 120, snare: 180, hihat: 7000, clap: 1200, tom: 140, subbass: 55, lead: 220, piano: 330 };
  oscillator.type = params.type === 'lead' ? 'sawtooth' : params.type === 'piano' ? 'triangle' : 'sine';
  oscillator.frequency.setValueAtTime(params.frequency ?? frequencies[params.type] ?? 220, time);
  gain.gain.setValueAtTime(Math.max(0.001, velocity), time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + Math.min(params.decay ?? 0.4, duration));
  oscillator.connect(gain).connect(destination);
  oscillator.start(time);
  oscillator.stop(time + Math.min(params.decay ?? 0.4, duration));
}

export async function renderProjectToWav(project: ProjectData, onProgress: ExportProgress = () => undefined): Promise<Blob> {
  const AudioContextClass = window.OfflineAudioContext;
  if (!AudioContextClass) throw new Error('Offline audio rendering is not supported in this browser');
  const bankIds: BankId[] = ['A', 'B', 'C', 'D'];
  const stepsPerBar = 16;
  const totalSteps = stepsPerBar * 2;
  const stepSeconds = 60 / Math.max(1, project.bpm) / 4;
  const tailSeconds = 2;
  const context = new AudioContextClass(2, Math.ceil(totalSteps * stepSeconds * contextSampleRate()), contextSampleRate());
  const master = context.createGain();
  master.gain.value = Math.max(0, Math.min(1, project.masterVolume));
  master.connect(context.destination);
  let completed = 0;
  for (let step = 0; step < totalSteps; step += 1) {
    const time = step * stepSeconds + (step % 2 === 1 ? stepSeconds * (Math.max(0, Math.min(100, project.swing)) / 100) * 0.5 : 0);
    for (const bank of bankIds) {
      const pattern = project.patterns[bank];
      for (const padPattern of pattern.pads) {
        const event = padPattern.steps[step % stepsPerBar];
        const pad = project.banks[bank][padPattern.padId];
        if (!event?.active || !pad || pad.isMuted) continue;
        if (pad.audioBuffer) {
          const source = context.createBufferSource();
          const gain = context.createGain();
          source.buffer = pad.audioBuffer;
          source.playbackRate.value = Math.pow(2, pad.pitch / 12);
          gain.gain.value = Math.max(0, Math.min(1, pad.volume * event.velocity));
          source.connect(gain).connect(master);
          source.start(time, Math.max(0, (pad.sampleStart ?? 0) * pad.audioBuffer.duration));
        } else if (pad.synthParams) {
          scheduleSynth(context, pad.synthParams, time, stepSeconds * 4, master, pad.volume * event.velocity);
        }
      }
    }
    completed += 1;
    onProgress(completed, totalSteps);
    await Promise.resolve();
  }
  const rendered = await context.startRendering();
  const wav = encodePcmWav(rendered);
  return new Blob([wav], { type: 'audio/wav' });
}

function contextSampleRate(): number {
  return 44100;
}
