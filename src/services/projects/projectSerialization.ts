import type { BankId, BankPattern, PadConfig, ProjectData } from '../../types';

export type ProjectSnapshot = {
  activeBank: BankId;
  projectName: string;
  projectArtist: string;
  banks: Record<BankId, Array<Omit<PadConfig, 'audioBuffer'> & { audioBuffer?: never }>>;
  patterns: Record<BankId, BankPattern>;
};

const forbiddenKeys = new Set(['audioBuffer', 'customSamples', 'mediaPipe', 'runtime']);

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => forbiddenKeys.has(key) || containsForbiddenKey(nested));
}

export function serializeProject(project: ProjectData): ProjectSnapshot {
  const banks = {} as ProjectSnapshot['banks'];
  for (const bank of ['A', 'B', 'C', 'D'] as BankId[]) {
    banks[bank] = project.banks[bank].map((pad) => {
      const { audioBuffer: _audioBuffer, ...metadata } = pad;
      return metadata;
    });
  }
  return {
    activeBank: project.activeBank,
    projectName: project.name,
    projectArtist: project.artist,
    banks,
    patterns: project.patterns,
  };
}

export function validateProjectSnapshot(value: unknown): ProjectSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Cloud project snapshot is invalid');
  if (containsForbiddenKey(value)) throw new Error('Cloud project snapshot contains runtime-only data');
  const snapshot = value as Partial<ProjectSnapshot>;
  if (!snapshot.banks || !snapshot.patterns || !snapshot.activeBank) throw new Error('Cloud project snapshot is incomplete');
  return snapshot as ProjectSnapshot;
}

export function projectFromCloudRecord(record: {
  id: string;
  name: string;
  artist: string;
  bpm: number;
  swing: number;
  volume: number;
  snapshot: unknown;
  createdAt: string;
  updatedAt: string;
}): ProjectData {
  const snapshot = validateProjectSnapshot(record.snapshot);
  return {
    id: record.id,
    name: record.name,
    artist: record.artist,
    bpm: record.bpm,
    swing: record.swing,
    masterVolume: record.volume,
    activeBank: snapshot.activeBank,
    banks: snapshot.banks,
    patterns: snapshot.patterns,
    createdAt: Date.parse(record.createdAt),
    updatedAt: Date.parse(record.updatedAt),
  };
}
