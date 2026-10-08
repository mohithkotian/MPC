import assert from 'node:assert/strict';
import http from 'node:http';
import test, { after, before } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.invalid';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SERVER_ENCRYPTION_KEY = 'test-encryption-key';
const originalFetch = globalThis.fetch;
const userId = '22222222-2222-4222-8222-222222222222';
const organizationId = '33333333-3333-4333-8333-333333333333';
const sampleId = '44444444-4444-4444-8444-444444444444';
function json(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); }
before(() => {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith(process.env.SUPABASE_URL!)) return originalFetch(input, init);
    if (url.endsWith('/auth/v1/user')) return json({ id: userId, email: 'owner@example.test', email_confirmed_at: '2026-01-01T00:00:00.000Z', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00.000Z' });
    if (url.includes('/rest/v1/profiles') && init?.method === 'POST') return json([], 201);
    if (url.includes('/rest/v1/profiles')) return json([{ id: userId, display_name: 'Verified owner', avatar_url: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }]);
    if (url.includes('/rest/v1/organizations')) return json([{ id: organizationId, name: 'Verified org', slug: 'verified-org', organization_members: [{ role: 'owner' }] }]);
    if (url.includes('/rest/v1/samples')) return json([]);
    return json({});
  };
});
after(() => { globalThis.fetch = originalFetch; });
const { app } = await import('../index');
const server = app.listen(0);
const address = server.address() as { port: number };
function request(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => { const req = http.request({ port: address.port, path, method: 'GET', headers }, (res) => { let data = ''; res.on('data', (chunk) => { data += chunk; }); res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : null })); }); req.on('error', reject); req.end(); });
}

test('protected session rejects missing bearer token', async () => { const result = await request('/api/auth/session'); assert.equal(result.status, 401); });
test('session returns the provider-verified identity', async () => { const result = await request('/api/auth/session', { Authorization: 'Bearer valid-token' }); assert.equal(result.status, 200); assert.equal(result.body.user.id, userId); assert.equal(result.body.user.email, 'owner@example.test'); });
test('me ignores a client-supplied user id and returns the verified profile', async () => { const result = await request('/api/me?user_id=99999999-9999-4999-8999-999999999999', { Authorization: 'Bearer valid-token' }); assert.equal(result.status, 200); assert.equal(result.body.id, userId); });
test('organizations returns only the request-scoped user membership', async () => { const result = await request('/api/me/organizations', { Authorization: 'Bearer valid-token' }); assert.equal(result.status, 200); assert.equal(result.body.organizations[0].id, organizationId); });
test('audio denies an unauthorized or cross-organization sample before file access', async () => { const result = await request(`/api/audio/stream/${sampleId}`, { Authorization: 'Bearer valid-token', 'x-organization-id': organizationId }); assert.equal(result.status, 404); });
after(() => { server.close(); });
