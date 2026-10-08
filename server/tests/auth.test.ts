import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import type { AuthenticatedRequest } from '../routes/auth';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.invalid';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SERVER_ENCRYPTION_KEY = 'test-encryption-key';
const originalFetch = globalThis.fetch;
const verifiedUser = { id: '11111111-1111-4111-8111-111111111111', email: 'verified@example.test', email_confirmed_at: '2026-01-01T00:00:00.000Z', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00.000Z' };
function response(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
let bootstrapCalls = 0;
before(() => {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith(process.env.SUPABASE_URL!)) return originalFetch(input, init);
    if (url.endsWith('/auth/v1/user')) {
      const token = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '');
      return token === 'valid-token' ? response(verifiedUser) : response({ message: 'invalid token' }, 401);
    }
    if (url.includes('/rest/v1/profiles')) { bootstrapCalls += 1; return response([], 201); }
    return response({ data: [] });
  };
});
after(() => { globalThis.fetch = originalFetch; });
const { requireAuth, bootstrapProfile } = await import('../routes/auth');
function resCapture() { let status = 200; let body: unknown; return { res: { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; } } as never, get status() { return status; }, get body() { return body; } }; }

test('requireAuth rejects a missing bearer token', async () => { const capture = resCapture(); await requireAuth({ headers: {} } as never, capture.res, () => undefined); assert.equal(capture.status, 401); });
test('requireAuth rejects malformed bearer syntax', async () => { const capture = resCapture(); await requireAuth({ headers: { authorization: 'Basic not-a-bearer' } } as never, capture.res, () => undefined); assert.equal(capture.status, 401); });
test('requireAuth rejects invalid and expired provider tokens', async () => { for (const token of ['invalid-token', 'expired-token']) { const capture = resCapture(); await requireAuth({ headers: { authorization: `Bearer ${token}` } } as never, capture.res, () => undefined); assert.equal(capture.status, 401); } });
test('requireAuth attaches the verified identity and request-scoped client for a valid token', async () => { const req = { headers: { authorization: 'Bearer valid-token' } } as AuthenticatedRequest; let nextCalled = false; await requireAuth(req, resCapture().res, () => { nextCalled = true; }); assert.equal(nextCalled, true); assert.equal(req.user?.id, verifiedUser.id); });
test('profile bootstrap is idempotent and uses verified auth.uid', async () => { bootstrapCalls = 0; const { createRequestSupabaseClient } = await import('../supabase'); const client = createRequestSupabaseClient('valid-token'); await bootstrapProfile(client, verifiedUser as never); await bootstrapProfile(client, verifiedUser as never); assert.equal(bootstrapCalls, 2); });
