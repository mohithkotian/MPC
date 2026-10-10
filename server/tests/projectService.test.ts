import assert from 'node:assert/strict';
import test from 'node:test';
import { ProjectServiceError, validateOrganizationId, validateProjectId, validateProjectInput } from '../services/projectService';

const snapshot = { activeBank: 'A', banks: { A: [], B: [], C: [], D: [] }, patterns: { A: {}, B: {}, C: {}, D: {} } };

function validInput() {
  return { name: 'Night Drive', artist: 'MPC', bpm: 107, swing: 0, volume: 0.85, bank: 'A', snapshot };
}

function expectStatus(operation: () => unknown, status: number): void {
  assert.throws(operation, (error: unknown) => error instanceof ProjectServiceError && error.status === status);
}

test('project input rejects unknown fields and out-of-range values', () => {
  expectStatus(() => validateProjectInput({ ...validInput(), owner_id: '11111111-1111-4111-8111-111111111111' }), 400);
  expectStatus(() => validateProjectInput({ ...validInput(), bpm: 300 }), 400);
  expectStatus(() => validateProjectInput({ ...validInput(), bank: 'Z' }), 400);
});

test('project input rejects runtime-only snapshot data and oversized snapshots', () => {
  expectStatus(() => validateProjectInput({ ...validInput(), snapshot: { ...snapshot, audioBuffer: {} } }), 400);
  expectStatus(() => validateProjectInput({ ...validInput(), snapshot: { banks: {}, patterns: {}, payload: 'x'.repeat(256 * 1024) } }), 400);
});

test('project and organization identifiers are validated before project operations', () => {
  assert.equal(validateProjectId('11111111-1111-4111-8111-111111111111'), '11111111-1111-4111-8111-111111111111');
  assert.equal(validateOrganizationId('22222222-2222-4222-8222-222222222222'), '22222222-2222-4222-8222-222222222222');
  expectStatus(() => validateProjectId('not-a-uuid'), 400);
  expectStatus(() => validateOrganizationId(undefined), 400);
});
