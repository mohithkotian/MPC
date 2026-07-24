export type BankId = 'A' | 'B' | 'C' | 'D';

export type ViewMode = 'MAIN' | 'STEP_EDIT' | 'SAMPLING' | 'MIXER' | 'KITS';

export type SynthType = 'kick' | 'snare' | 'hihat' | 'clap' | 'tom' | 'subbass' | 'lead' | 'piano' | 'none';

export interface SynthParams {
  type: SynthType;
  frequency?: number;
  decay?: number;
  pitchSweep?: number;
  noiseFilter?: number;
}

export interface PadConfig {
  id: number; // 0..15 (or 0..63 absolute across 4 banks)
  bank: BankId;
  bankPadIndex: number; // 0..15
  name: string;
  keyLabel: string;
  sampleId?: string;
  audioUrl?: string;
  audioBuffer?: AudioBuffer | null;
  volume: number; // 0 to 1
  pitch: number; // -12 to +12 semitones
  pan: number; // -1 to 1
  chokeGroup: number; // 0 = no choke, 1..4 = choke groups
  synthParams?: SynthParams;
  sampleStart?: number; // 0 to 1
  sampleEnd?: number; // 0 to 1
}

export interface Step {
  active: boolean;
  velocity: number; // 0 to 1
}

export interface PadPattern {
  padId: number; // 0..15 within bank
  steps: Step[]; // array of 16 steps
}

export interface BankPattern {
  bankId: BankId;
  pads: PadPattern[]; // 16 pad patterns
}

export interface ProjectData {
  id: string;
  name: string;
  artist: string;
  bpm: number;
  swing: number;
  masterVolume: number;
  activeBank: BankId;
  banks: Record<BankId, PadConfig[]>;
  patterns: Record<BankId, BankPattern>;
  customSamples?: Record<string, { name: string; data: ArrayBuffer }>;
  createdAt: number;
  updatedAt: number;
}

export interface PresetKit {
  id: string;
  name: string;
  artist: string;
  bpm: number;
  description: string;
  banks: Record<BankId, Partial<PadConfig>[]>;
}
