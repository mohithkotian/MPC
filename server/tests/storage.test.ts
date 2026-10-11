import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import type { AuthenticatedRequest } from '../routes/auth';
import { authorizePresetSample, authorizeTenantSample, authorizeThenCreateStorage } from '../routes/audio';
import { LocalSampleStorage, StorageProviderError, SupabaseStorage, isSafeStorageKey, type SampleStorage } from '../storage/SampleStorage';

const userId = '22222222-2222-4222-8222-222222222222';
const organizationId = '33333333-3333-4333-8333-333333333333';
const otherOrganizationId = '55555555-5555-4555-8555-555555555555';
const sampleId = '44444444-4444-4444-8444-444444444444';
const storageKey = '59f30c7d-13df-424f-b93e-a8b41184cef3.mp3';

type SampleRow = { organization_id: string; storage_key: string; status: string };
type MembershipRow = { organization_id: string; user_id: string; deleted_at: string | null };

function requestWithDatabase(sample: SampleRow | null, membership: MembershipRow | null): AuthenticatedRequest {
  const client = {
    from(table: string) {
      let result: SampleRow | MembershipRow | null = table === 'samples' ? sample : membership;
      const chain = {
        select() { return chain; },
        eq(column: string, value: string) {
          if (table === 'organization_members' && result && (result as unknown as Record<string, unknown>)[column] !== value) result = null;
          return chain;
        },
        is(column: string, value: null) {
          if (table === 'organization_members' && result && (result as unknown as Record<string, unknown>)[column] !== value) result = null;
          return chain;
        },
        async maybeSingle() { return { data: result, error: null }; },
      };
      return chain;
    },
  };
  return { params: { sampleId }, user: { id: userId } as never, supabase: client as never } as unknown as AuthenticatedRequest;
}

function presetRequestWithDatabase(samples: Array<SampleRow & { id: string; kit_id?: string; pad_index?: number }>, memberships: MembershipRow[], organizationHeader?: string, alias = 'kit1-pad11'): AuthenticatedRequest {
  const client = {
    from(table: string) {
      let rows: Array<Record<string, unknown>> = (table === 'organization_members'
        ? memberships
        : samples.map((sample) => ({ ...sample, kit_id: sample.kit_id ?? 'kit1', pad_index: sample.pad_index ?? 10, deleted_at: null }))) as Array<Record<string, unknown>>;
      const chain = {
        select() { return chain; },
        eq(column: string, value: unknown) { rows = rows.filter((row) => row[column] === value); return chain; },
        is(column: string, value: unknown) { rows = rows.filter((row) => row[column] === value); return chain; },
        in(column: string, values: unknown[]) { rows = rows.filter((row) => values.includes(row[column])); return chain; },
        limit(count: number) { rows = rows.slice(0, count); return Promise.resolve({ data: rows, error: null }); },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        then(resolve: (result: { data: Array<Record<string, unknown>>; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  return {
    params: { sampleId: alias },
    user: { id: userId } as never,
    supabase: client as never,
    header: (name: string) => name.toLowerCase() === 'x-organization-id' ? organizationHeader : undefined,
  } as unknown as AuthenticatedRequest;
}

test('authorized same-organization sample returns its trusted storage key', async () => {
  const result = await authorizeTenantSample(requestWithDatabase(
    { organization_id: organizationId, storage_key: storageKey, status: 'ready' },
    { organization_id: organizationId, user_id: userId, deleted_at: null },
  ));
  assert.deepEqual(result, { storageKey });
});

test('cross-organization sample is denied by the membership check', async () => {
  const result = await authorizeTenantSample(requestWithDatabase(
    { organization_id: organizationId, storage_key: storageKey, status: 'ready' },
    null,
  ));
  assert.equal(result, null);
});

test('preset alias resolves to the unique ready sample row in an active member organization', async () => {
  const result = await authorizePresetSample(presetRequestWithDatabase(
    [{ id: sampleId, organization_id: organizationId, storage_key: storageKey, status: 'ready' }],
    [{ organization_id: organizationId, user_id: userId, deleted_at: null }],
    organizationId,
  ));
  assert.deepEqual(result, { sampleId, storageKey });
});

test('RUNAWAY kit2-pad1 resolves to catalog pad index zero', async () => {
  const result = await authorizePresetSample(presetRequestWithDatabase(
    [{ id: sampleId, organization_id: organizationId, storage_key: storageKey, status: 'ready', kit_id: 'kit2', pad_index: 0 }],
    [{ organization_id: organizationId, user_id: userId, deleted_at: null }],
    organizationId,
    'kit2-pad1',
  ));
  assert.deepEqual(result, { sampleId, storageKey });
});

test('staging and production preset routes resolve aliases through the database catalog', async () => {
  const previousEnvironment = process.env.NODE_ENV;
  try {
    for (const environment of ['staging', 'production']) {
      process.env.NODE_ENV = environment;
      const authorized = await authorizeThenCreateStorage(
        presetRequestWithDatabase(
          [{ id: sampleId, organization_id: organizationId, storage_key: storageKey, status: 'ready' }],
          [{ organization_id: organizationId, user_id: userId, deleted_at: null }],
          organizationId,
        ),
        () => ({ get: async () => null }),
      );
      assert.deepEqual(authorized?.sample, { sampleId, storageKey });
    }
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  }
});

test('preset alias resolution denies requests without an active organization context', async () => {
  const result = await authorizePresetSample(presetRequestWithDatabase(
    [{ id: sampleId, organization_id: organizationId, storage_key: storageKey, status: 'ready' }],
    [{ organization_id: organizationId, user_id: userId, deleted_at: null }],
  ));
  assert.equal(result, null);
});

test('preset alias with a missing catalog row is denied', async () => {
  const result = await authorizePresetSample(presetRequestWithDatabase(
    [], [{ organization_id: organizationId, user_id: userId, deleted_at: null }], organizationId,
  ));
  assert.equal(result, null);
});

test('preset alias cannot resolve a row in an organization where the caller is not a member', async () => {
  const result = await authorizePresetSample(presetRequestWithDatabase(
    [{ id: sampleId, organization_id: otherOrganizationId, storage_key: storageKey, status: 'ready' }],
    [{ organization_id: organizationId, user_id: userId, deleted_at: null }], organizationId,
  ));
  assert.equal(result, null);
});

test('authorized sample with an absent private storage object remains absent', async () => {
  const authorized = await authorizeThenCreateStorage(
    presetRequestWithDatabase(
      [{ id: sampleId, organization_id: organizationId, storage_key: storageKey, status: 'ready' }],
      [{ organization_id: organizationId, user_id: userId, deleted_at: null }], organizationId,
    ),
    () => ({ get: async () => null }),
  );
  assert.ok(authorized);
  assert.equal(await authorized.storage.get(authorized.sample.storageKey), null);
});

test('inactive or removed membership is denied', async () => {
  const result = await authorizeTenantSample(requestWithDatabase(
    { organization_id: organizationId, storage_key: storageKey, status: 'ready' },
    { organization_id: organizationId, user_id: userId, deleted_at: '2026-10-09T00:00:00.000Z' },
  ));
  assert.equal(result, null);
});

test('invalid and traversal storage keys are rejected', () => {
  assert.equal(isSafeStorageKey('../secret.mp3'), false);
  assert.equal(isSafeStorageKey('/absolute/secret.mp3'), false);
  assert.equal(isSafeStorageKey(`organizations/${organizationId}/samples/${sampleId}.mp3`), true);
  assert.equal(isSafeStorageKey('not-a-sample.mp3'), false);
});

test('storage is never created before authorization succeeds', async () => {
  let factoryCalls = 0;
  const storage: SampleStorage = { async get() { throw new Error('must not be called'); } };
  const result = await authorizeThenCreateStorage(
    requestWithDatabase(
      { organization_id: organizationId, storage_key: storageKey, status: 'ready' },
      null,
    ),
    () => { factoryCalls += 1; return storage; },
  );
  assert.equal(result, null);
  assert.equal(factoryCalls, 0);
});

test('local storage returns an existing development sample', async () => {
  const samplesDirectory = await mkdtemp(path.join(os.tmpdir(), 'mpc-storage-test-'));
  try {
    await writeFile(path.join(samplesDirectory, storageKey), Buffer.from('synthetic test audio'));
    const local = new LocalSampleStorage(samplesDirectory);
    const object = await local.get(storageKey);
    assert.ok(object);
    assert.equal(object.contentType, 'audio/mpeg');
    object.body.destroy();
  } finally {
    await rm(samplesDirectory, { recursive: true, force: true });
  }
});

test('Supabase Storage provider failures are controlled', async () => {
  const client = { storage: { from: () => ({ download: async () => ({ data: null, error: { message: 'storage unavailable', statusCode: 503 } }) }) } } as never;
  await assert.rejects(() => new SupabaseStorage(client, 'samples').get(storageKey), (error: unknown) => error instanceof StorageProviderError);
});

test('Supabase Storage MIME metadata is restricted to MP3 types', async () => {
  const unsafeClient = { storage: { from: () => ({ download: async () => ({ data: new Blob(['audio'], { type: 'text/html' }), error: null }) }) } } as never;
  const unsafeObject = await new SupabaseStorage(unsafeClient, 'samples').get(storageKey);
  assert.equal(unsafeObject?.contentType, 'audio/mpeg');
  unsafeObject?.body.destroy();

  const mp3Client = { storage: { from: () => ({ download: async () => ({ data: new Blob(['audio'], { type: 'audio/mp3' }), error: null }) }) } } as never;
  const mp3Object = await new SupabaseStorage(mp3Client, 'samples').get(storageKey);
  assert.equal(mp3Object?.contentType, 'audio/mp3');
  mp3Object?.body.destroy();
});

test('production configuration cannot fall back to local storage', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--eval', "import './server/config.ts'"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production', STORAGE_PROVIDER: 'local', SUPABASE_URL: 'https://test.supabase.invalid', SUPABASE_ANON_KEY: 'test-anon-key', SERVER_ENCRYPTION_KEY: 'test-encryption-key', ALLOWED_ORIGINS: 'https://example.test' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /local storage is only allowed/i);
});

test('unsafe tenant storage key is denied before storage creation', async () => {
  let factoryCalls = 0;
  const result = await authorizeThenCreateStorage(
    requestWithDatabase(
      { organization_id: otherOrganizationId, storage_key: '../escape.mp3', status: 'ready' },
      { organization_id: otherOrganizationId, user_id: userId, deleted_at: null },
    ),
    () => { factoryCalls += 1; return { get: async () => null }; },
  );
  assert.equal(result, null);
  assert.equal(factoryCalls, 0);
});
