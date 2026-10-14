import type { BankId, BankPattern, PadConfig } from '../../types';

export type MusicalSnapshot = {
  banks: Record<BankId, Array<Omit<PadConfig, 'audioBuffer'> & { audioBuffer?: never }>>;
  patterns: Record<BankId, BankPattern>;
};

export function createMusicalSnapshot(
  banks: Record<BankId, PadConfig[]>,
  patterns: Record<BankId, BankPattern>
): MusicalSnapshot {
  const snapshotBanks = {} as MusicalSnapshot['banks'];
  for (const bank of ['A', 'B', 'C', 'D'] as BankId[]) {
    snapshotBanks[bank] = banks[bank].map(({ audioBuffer: _audioBuffer, ...pad }) => ({ ...pad }));
  }
  return {
    banks: snapshotBanks,
    patterns: structuredClone(patterns),
  };
}

export function cloneMusicalSnapshot(snapshot: MusicalSnapshot): MusicalSnapshot {
  return structuredClone(snapshot);
}
