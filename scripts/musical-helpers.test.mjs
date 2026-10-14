import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPlayPad, hasSoloPad, getSwingDelayMs } from '../src/services/audio/padRouting.ts';
import { encodePcmWav } from '../src/services/audio/wavEncoder.ts';
import { cloneMusicalSnapshot, createMusicalSnapshot } from '../src/services/projects/musicalHistory.ts';
import { projectFromCloudRecord, serializeProject } from '../src/services/projects/projectSerialization.ts';
import { renderProjectToWav } from '../src/services/audio/wavExport.ts';

function makePad(overrides = {}) {
  return {
    id: 0,
    bank: 'A',
    bankPadIndex: 0,
    name: 'Sample pad',
    keyLabel: '1',
    sampleId: 'sample-1',
    audioUrl: '/api/audio/sample-1',
    audioBuffer: { runtimeOnly: true },
    volume: 1,
    pitch: 0,
    pan: 0,
    chokeGroup: 0,
    ...overrides,
  };
}

function makePatterns() {
  const pattern = { bankId: 'A', pads: [{ padId: 0, steps: [{ active: true, velocity: 0.75 }] }] };
  return { A: pattern, B: { ...pattern, bankId: 'B' }, C: { ...pattern, bankId: 'C' }, D: { ...pattern, bankId: 'D' } };
}

test('mute and solo routing is deterministic', () => {
  assert.equal(shouldPlayPad({ isMuted: true, isSolo: false }, false), false);
  assert.equal(shouldPlayPad({ isMuted: false, isSolo: false }, true), false);
  assert.equal(shouldPlayPad({ isMuted: false, isSolo: true }, true), true);
  assert.equal(hasSoloPad([{ isMuted: true, isSolo: true }, { isMuted: false, isSolo: false }]), false);
});

test('swing delays odd sixteenth steps only', () => {
  assert.equal(getSwingDelayMs(0, 120, 50), 0);
  assert.equal(getSwingDelayMs(1, 120, 50), 31.25);
  assert.equal(getSwingDelayMs(2, 120, 100), 0);
});

test('WAV encoder writes PCM RIFF metadata and interleaved samples', () => {
  const left = new Float32Array([0, 1, -1]);
  const right = new Float32Array([0.5, -0.5, 0]);
  const wav = encodePcmWav({ numberOfChannels: 2, sampleRate: 8000, length: 3, getChannelData: (channel) => channel ? right : left });
  const view = new DataView(wav);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(wav.slice(8, 12)), 'WAVE');
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 8000);
  assert.equal(view.byteLength, 44 + 3 * 2 * 2);
  assert.equal(view.getInt16(46, true), 16383);
});

test('musical history snapshots omit runtime buffers and clone independently', () => {
  const pad = makePad();
  const banks = { A: [pad], B: [], C: [], D: [] };
  const patterns = makePatterns();
  const snapshot = createMusicalSnapshot(banks, patterns);
  assert.equal('audioBuffer' in snapshot.banks.A[0], false);

  const clone = cloneMusicalSnapshot(snapshot);
  clone.banks.A[0].name = 'Edited';
  clone.patterns.A.pads[0].steps[0].active = false;
  assert.equal(snapshot.banks.A[0].name, 'Sample pad');
  assert.equal(snapshot.patterns.A.pads[0].steps[0].active, true);
});

test('WAV export refuses an empty pattern with a clear error instead of fake output', async () => {
  globalThis.window = globalThis.window ?? {};
  globalThis.window.OfflineAudioContext = class {
    constructor() {
      throw new Error('OfflineAudioContext must not be constructed for an empty pattern');
    }
  };
  const inactiveSteps = Array.from({ length: 16 }, () => ({ active: false, velocity: 0.9 }));
  const padPattern = { padId: 0, steps: inactiveSteps };
  const project = {
    id: 'empty-project',
    name: 'Empty',
    artist: '',
    bpm: 120,
    swing: 0,
    masterVolume: 1,
    activeBank: 'A',
    banks: { A: [], B: [], C: [], D: [] },
    patterns: {
      A: { bankId: 'A', pads: [padPattern] },
      B: { bankId: 'B', pads: [padPattern] },
      C: { bankId: 'C', pads: [padPattern] },
      D: { bankId: 'D', pads: [padPattern] },
    },
    createdAt: 1,
    updatedAt: 2,
  };
  await assert.rejects(() => renderProjectToWav(project), /no active steps/);
});

test('sample assignments survive project serialization for reload restoration', () => {
  const project = {
    id: 'project-1',
    name: 'Reload me',
    artist: 'MPC',
    bpm: 120,
    swing: 25,
    masterVolume: 0.8,
    activeBank: 'A',
    banks: { A: [makePad()], B: [], C: [], D: [] },
    patterns: makePatterns(),
    createdAt: 1,
    updatedAt: 2,
  };
  const serialized = serializeProject(project);
  assert.equal('audioBuffer' in serialized.banks.A[0], false);
  const restored = projectFromCloudRecord({
    id: project.id,
    name: project.name,
    artist: project.artist,
    bpm: project.bpm,
    swing: project.swing,
    volume: project.masterVolume,
    snapshot: serialized,
    createdAt: new Date(project.createdAt).toISOString(),
    updatedAt: new Date(project.updatedAt).toISOString(),
  });
  assert.equal(restored.banks.A[0].sampleId, 'sample-1');
  assert.equal(restored.banks.A[0].audioUrl, '/api/audio/sample-1');
  assert.equal(restored.banks.A[0].audioBuffer, undefined);
});
