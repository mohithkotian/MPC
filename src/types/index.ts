export type BankId = 'A' | 'B' | 'C' | 'D';

export type ViewMode = 'MAIN' | 'STEP_EDIT' | 'SAMPLING' | 'MIXER' | 'KITS' | 'PAD_STUDIO';

export type SynthType = 'kick' | 'snare' | 'hihat' | 'clap' | 'tom' | 'subbass' | 'lead' | 'piano' | 'none';

export interface SynthParams {
  type: SynthType;
  frequency?: number;
  decay?: number;
  pitchSweep?: number;
  noiseFilter?: number;
}

export interface PadConfig {
  id: number;
  bank: BankId;
  bankPadIndex: number;
  name: string;
  keyLabel: string;
  sampleId?: string;
  audioUrl?: string;
  audioBuffer?: AudioBuffer | null;
  volume: number;
  pitch: number;
  pan: number;
  chokeGroup: number;
  synthParams?: SynthParams;
  sampleStart?: number;
  sampleEnd?: number;
}

export interface Step {
  active: boolean;
  velocity: number;
}

export interface PadPattern {
  padId: number;
  steps: Step[];
}

export interface BankPattern {
  bankId: BankId;
  pads: PadPattern[];
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
