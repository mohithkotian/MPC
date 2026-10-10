import assert from 'node:assert/strict';
import http from 'node:http';
import test, { after, before } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://projects.test.supabase.invalid';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SERVER_ENCRYPTION_KEY = 'test-encryption-key';

const originalFetch = globalThis.fetch;
const userId = '22222222-2222-4222-8222-222222222222';
const organizationId = '33333333-3333-4333-8333-333333333333';
const viewerOrganizationId = '44444444-4444-4444-8444-444444444444';
const otherOrganizationId = '55555555-5555-4555-8555-555555555555';
const projectId = '66666666-6666-4666-8666-666666666666';
const snapshot = { activeBank: 'A', banks: { A: [], B: [], C: [], D: [] }, patterns: { A: {}, B: {}, C: {}, D: {} } };
const project = {
  id: projectId,
  organization_id: organizationId,
  owner_id: userId,
  name: 'Cloud Beat',
  artist: 'MPC Artist',
  bpm: 120,
  swing: 0,
  volume: 0.8,
  bank: 'A',
  snapshot,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null as string | null,
};
const projects = [project];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

before(() => {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (!url.startsWith(process.env.SUPABASE_URL!)) return originalFetch(input, init);
    if (url.endsWith('/auth/v1/user')) return json({ id: userId, email: 'owner@example.test', email_confirmed_at: '2026-01-01T00:00:00.000Z', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00.000Z' });
    if (url.includes('/rest/v1/profiles') && method === 'POST') return json([], 201);
    if (url.includes('/rest/v1/organization_members')) {
      if (url.includes(viewerOrganizationId)) return json([{ role: 'viewer' }]);
      if (url.includes(otherOrganizationId)) return json([]);
      return json([{ role: 'owner' }]);
    }
    if (url.includes('/rest/v1/projects')) {
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        const created = { ...project, ...body, id: projectId, organization_id: organizationId, owner_id: userId };
        projects.splice(0, projects.length, created);
        return json(created, 201);
      }
      if (method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        Object.assign(project, body, { updated_at: '2026-01-02T00:00:00.000Z' });
        return json(project);
      }
      if (method === 'GET') {
        if (url.includes(`id=eq.${projectId}`)) return json(project.deleted_at ? [] : [project]);
        const organizationMatch = url.match(/organization_id=eq\.([0-9a-f-]+)/i)?.[1];
        return json(organizationMatch === organizationId ? projects.filter((item) => !item.deleted_at) : []);
      }
    }
    return json({});
  };
});

after(() => { globalThis.fetch = originalFetch; });
const { app } = await import('../index');
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address() as { port: number };

function request(path: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: address.port, path, method: options.method ?? 'GET', headers: options.headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed: any = null;
        try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

const authHeaders = { Authorization: 'Bearer valid-token', 'x-organization-id': organizationId, 'Content-Type': 'application/json' };
const body = JSON.stringify({ name: 'Cloud Beat', artist: 'MPC Artist', bpm: 120, swing: 0, volume: 0.8, bank: 'A', snapshot });

test('projects reject unauthenticated access and missing or malformed organization context', async () => {
  assert.equal((await request('/api/projects')).status, 401);
  assert.equal((await request('/api/projects', { headers: { Authorization: 'Bearer valid-token' } })).status, 400);
  assert.equal((await request('/api/projects', { headers: { ...authHeaders, 'x-organization-id': 'not-a-uuid' } })).status, 400);
});

test('viewer cannot create a project', async () => {
  const result = await request('/api/projects', { method: 'POST', headers: { ...authHeaders, 'x-organization-id': viewerOrganizationId }, body });
  assert.equal(result.status, 403);
});

test('project lifecycle creates, updates, lists, and soft-deletes without enumeration', async () => {
  const created = await request('/api/projects', { method: 'POST', headers: authHeaders, body });
  assert.equal(created.status, 201);
  assert.equal(created.body.id, projectId);

  const updated = await request(`/api/projects/${projectId}`, { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ ...JSON.parse(body), name: 'Updated Beat' }) });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, 'Updated Beat');

  const listed = await request('/api/projects', { headers: authHeaders });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.projects.length, 1);

  const deleted = await request(`/api/projects/${projectId}`, { method: 'DELETE', headers: authHeaders });
  assert.equal(deleted.status, 204);
  project.deleted_at = '2026-01-03T00:00:00.000Z';

  const missing = await request(`/api/projects/${projectId}`, { headers: authHeaders });
  assert.equal(missing.status, 404);
  const crossOrganization = await request(`/api/projects/${projectId}`, { headers: { ...authHeaders, 'x-organization-id': otherOrganizationId } });
  assert.equal(crossOrganization.status, 403);
});

test('project API rejects unknown fields and malformed JSON', async () => {
  const unknown = await request('/api/projects', { method: 'POST', headers: authHeaders, body: JSON.stringify({ ...JSON.parse(body), owner_id: userId }) });
  assert.equal(unknown.status, 400);
  const malformed = await request('/api/projects', { method: 'POST', headers: authHeaders, body: '{not-json' });
  assert.equal(malformed.status, 400);
});

after(() => { server.close(); });
