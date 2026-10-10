import assert from 'node:assert/strict';
import test from 'node:test';
import { ProjectServiceError, validateOrganizationId, validateProjectId, validateProjectInput } from '../services/projectService';

const snapshot = { activeBank: 'A', banks: { A: [], B: [], C: [], D: [] }, patterns: { A: {}, B: {}, C: {}, D: {} } };

function expectStatus(operation: () => unknown, status: number): void {
  assert.throws(operation, (error: unknown) => error instanceof ProjectServiceError && error.status === status);
}

test('project input accepts bounded deterministic metadata', () => {
  const input = validateProjectInput({ name: 'Beat', artist: 'Artist', bpm: 120, swing: 10, volume: 0.8, bank: 'A', snapshot });
  assert.equal(input.name, 'Beat');
  assert.equal(input.bank, 'A');
});

test('project input rejects unknown fields and invalid values', () => {
  expectStatus(() => validateProjectInput({ name: 'Beat', artist: '', bpm: 120, swing: 10, volume: 0.8, bank: 'A', snapshot, owner_id: 'bad' }), 400);
  expectStatus(() => validateProjectInput({ name: 'Beat', artist: '', bpm: 20, swing: 10, volume: 0.8, bank: 'A', snapshot }), 400);
  expectStatus(() => validateProjectInput({ name: 'Beat', artist: '', bpm: 120, swing: 10, volume: 0.8, bank: 'Z', snapshot }), 400);
  expectStatus(() => validateProjectInput({ name: 'Beat', artist: '', bpm: 120, swing: 10, volume: 0.8, bank: 'A', snapshot: { ...snapshot, audioBuffer: {} } }), 400);
});

test('project and organization identifiers must be UUIDs', () => {
  assert.equal(validateProjectId('11111111-1111-4111-8111-111111111111'), '11111111-1111-4111-8111-111111111111');
  assert.equal(validateOrganizationId('22222222-2222-4222-8222-222222222222'), '22222222-2222-4222-8222-222222222222');
  expectStatus(() => validateProjectId('default-project'), 400);
  expectStatus(() => validateOrganizationId(undefined), 400);
});
