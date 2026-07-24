import { BankId, PadConfig, PresetKit } from '../../types';

export const KEY_LABELS: string[] = [
  'A', 'S', 'D', 'F',
  'G', 'H', 'J', 'K',
  'Z', 'X', 'C', 'V',
  'B', 'N', 'M', 'L'
];

export function createEmptyBank(bankId: BankId): PadConfig[] {
  return Array.from({ length: 16 }, (_, i) => ({
    id: i,
    bank: bankId,
    bankPadIndex: i,
    name: `Pad ${i + 1}`,
    keyLabel: KEY_LABELS[i],
    volume: 0.9,
    pitch: 0,
    pan: 0,
    chokeGroup: 0,
    synthParams: { type: 'none' },
  }));
}

export const PRESET_KITS: Record<string, PresetKit> = {
  kit1: {
    id: 'kit1',
    name: 'FATHER',
    artist: '',
    bpm: 107,
    description: 'Heavy sub bass, vocal chops, and melodic loops.',
    banks: {
      A: [
        { bankPadIndex: 0, name: 'Bass 1', audioUrl: 'kit1-pad1' },
        { bankPadIndex: 1, name: 'Bass 2', audioUrl: 'kit1-pad2' },
        { bankPadIndex: 2, name: 'Bass 3', audioUrl: 'kit1-pad3' },
        { bankPadIndex: 3, name: 'Bass 4', audioUrl: 'kit1-pad4' },
        { bankPadIndex: 4, name: 'Vocal Chop', audioUrl: 'kit1-pad5' },
        { bankPadIndex: 5, name: 'Vox Hit', audioUrl: 'kit1-pad6' },
        { bankPadIndex: 6, name: 'Synth Stab', audioUrl: 'kit1-pad7' },
        { bankPadIndex: 7, name: 'Perc Loop', audioUrl: 'kit1-pad8' },
        { bankPadIndex: 8, name: 'Beat Loop', audioUrl: 'kit1-pad9' },
        { bankPadIndex: 9, name: 'Intro FX', audioUrl: 'kit1-pad10' },
        { bankPadIndex: 10, name: 'Pluck', audioUrl: 'kit1-pad11' },
        { bankPadIndex: 11, name: 'Pad Long', audioUrl: 'kit1-pad12' },
        { bankPadIndex: 12, name: 'Riser', audioUrl: 'kit1-pad13' },
        { bankPadIndex: 13, name: 'Stop' },
        { bankPadIndex: 14, name: 'Camera' },
        { bankPadIndex: 15, name: 'Info' },
      ],
      B: [], C: [], D: []
    }
  },

  kit2: {
    id: 'kit2',
    name: 'RUNAWAY',
    artist: '',
    bpm: 85,
    description: 'Piano notes, vocal stabs, and atmospheric loops.',
    banks: {
      A: [
        { bankPadIndex: 0, name: 'Piano 1', audioUrl: 'kit2-pad1' },
        { bankPadIndex: 1, name: 'Piano 2', audioUrl: 'kit2-pad2' },
        { bankPadIndex: 2, name: 'Piano 3', audioUrl: 'kit2-pad3' },
        { bankPadIndex: 3, name: 'Piano 4', audioUrl: 'kit2-pad4' },
        { bankPadIndex: 4, name: 'Piano 5', audioUrl: 'kit2-pad5' },
        { bankPadIndex: 5, name: 'Piano 6', audioUrl: 'kit2-pad6' },
        { bankPadIndex: 6, name: 'Piano 7', audioUrl: 'kit2-pad7' },
        { bankPadIndex: 7, name: 'Piano 8', audioUrl: 'kit2-pad8' },
        { bankPadIndex: 8, name: 'Vox Stab', audioUrl: 'kit2-pad9' },
        { bankPadIndex: 9, name: 'Choir Hit', audioUrl: 'kit2-pad10' },
        { bankPadIndex: 10, name: 'Vocal', audioUrl: 'kit2-pad11' },
        { bankPadIndex: 11, name: 'Synth Pad', audioUrl: 'kit2-pad12' },
        { bankPadIndex: 12, name: 'Loop', audioUrl: 'kit2-pad13' },
        { bankPadIndex: 13, name: 'Stop' },
        { bankPadIndex: 14, name: 'Camera' },
        { bankPadIndex: 15, name: 'Info' },
      ],
      B: [], C: [], D: []
    }
  },

  synth808: {
    id: 'synth808',
    name: 'SAMPLE',
    artist: '',
    bpm: 120,
    description: 'Pure synthesized drum machine & synth kit.',
    banks: {
      A: [
        { bankPadIndex: 0, name: 'Kick', synthParams: { type: 'kick', frequency: 140, decay: 0.5 } },
        { bankPadIndex: 1, name: 'Snare', synthParams: { type: 'snare', noiseFilter: 900, decay: 0.25 } },
        { bankPadIndex: 2, name: 'HiHat C', synthParams: { type: 'hihat', decay: 0.06 }, chokeGroup: 1 },
        { bankPadIndex: 3, name: 'HiHat O', synthParams: { type: 'hihat', decay: 0.4 }, chokeGroup: 1 },
        { bankPadIndex: 4, name: 'Clap', synthParams: { type: 'clap', decay: 0.3 } },
        { bankPadIndex: 5, name: 'Tom L', synthParams: { type: 'tom', frequency: 100, decay: 0.35 } },
        { bankPadIndex: 6, name: 'Tom M', synthParams: { type: 'tom', frequency: 160, decay: 0.3 } },
        { bankPadIndex: 7, name: 'Tom H', synthParams: { type: 'tom', frequency: 240, decay: 0.25 } },
        { bankPadIndex: 8, name: 'Sub C1', synthParams: { type: 'subbass', frequency: 32.7, decay: 0.8 } },
        { bankPadIndex: 9, name: 'Sub G1', synthParams: { type: 'subbass', frequency: 49.0, decay: 0.8 } },
        { bankPadIndex: 10, name: 'Lead C3', synthParams: { type: 'lead', frequency: 130.8, decay: 0.5 } },
        { bankPadIndex: 11, name: 'Lead E3', synthParams: { type: 'lead', frequency: 164.8, decay: 0.5 } },
        { bankPadIndex: 12, name: 'Keys C4', synthParams: { type: 'piano', frequency: 261.6, decay: 0.6 } },
        { bankPadIndex: 13, name: 'Stop' },
        { bankPadIndex: 14, name: 'Camera' },
        { bankPadIndex: 15, name: 'Info' },
      ],
      B: [], C: [], D: []
    }
  }
};
