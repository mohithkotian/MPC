import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeProject, validateProjectSnapshot } from '../../src/services/projects/projectSerialization';

test('cloud serialization strips runtime audio buffers and snapshot validation rejects runtime data', () => {
  const project = {
    id: 'project-1', name: 'Test', artist: '', bpm: 100, swing: 0, masterVolume: 0.8, activeBank: 'A',
    banks: { A: [{ id: 0, bank: 'A', bankPadIndex: 0, name: 'Kick', keyLabel: 'Q', audioBuffer: { runtime: true }, volume: 1, pitch: 0, pan: 0, chokeGroup: 0 }], B: [], C: [], D: [] },
    patterns: { A: { bankId: 'A', pads: [] }, B: { bankId: 'B', pads: [] }, C: { bankId: 'C', pads: [] }, D: { bankId: 'D', pads: [] } },
    customSamples: { local: { name: 'local.wav', data: new ArrayBuffer(8) } }, createdAt: 1, updatedAt: 2,
  } as never;
  const serialized = serializeProject(project);
  assert.equal('audioBuffer' in serialized.banks.A[0], false);
  assert.equal(serialized.projectName, 'Test');
  assert.equal(serialized.banks.A[0].name, 'Kick');
  assert.throws(() => validateProjectSnapshot({ ...serialized, customSamples: {} }), /runtime-only data/);
});
