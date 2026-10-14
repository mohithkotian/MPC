import type { PadConfig } from '../../types';

export function shouldPlayPad(pad: Pick<PadConfig, 'isMuted' | 'isSolo'>, anySolo: boolean): boolean {
  if (pad.isMuted) return false;
  return !anySolo || pad.isSolo === true;
}

export function hasSoloPad(pads: Array<Pick<PadConfig, 'isMuted' | 'isSolo'>>): boolean {
  return pads.some((pad) => pad.isSolo === true && !pad.isMuted);
}

export function getSwingDelayMs(step: number, bpm: number, swing: number): number {
  const clampedBpm = Math.max(1, bpm);
  const clampedSwing = Math.max(0, Math.min(100, swing));
  const sixteenthMs = 60000 / clampedBpm / 4;
  return step % 2 === 1 ? sixteenthMs * (clampedSwing / 100) * 0.5 : 0;
}
