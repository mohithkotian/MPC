import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import type { AuthenticatedRequest } from '../routes/auth';
import { authorizeTenantSample, authorizeThenCreateStorage } from '../routes/audio';
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
  const local = new LocalSampleStorage('server/storage/samples');
  const object = await local.get(storageKey);
  assert.ok(object);
  assert.equal(object.contentType, 'audio/mpeg');
  object.body.destroy();
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
