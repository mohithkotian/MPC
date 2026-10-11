import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProjectData } from '../../src/types';
import { CloudProjectError, createCloudProjectApi, projectApiUrl } from '../../src/services/projects/projectApi';

const apiBase = 'https://mpc-staging-backend.onrender.com/';
const organizationId = '33333333-3333-4333-8333-333333333333';
const projectId = '66666666-6666-4666-8666-666666666666';
const snapshot = { activeBank: 'A', banks: { A: [], B: [], C: [], D: [] }, patterns: { A: {}, B: {}, C: {}, D: {} } };
const record = {
  id: projectId,
  name: 'Cloud Beat',
  artist: 'MPC Artist',
  bpm: 120,
  swing: 0,
  volume: 0.8,
  bank: 'A',
  snapshot,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const project = {
  id: 'default-project',
  name: 'Cloud Beat',
  artist: 'MPC Artist',
  bpm: 120,
  swing: 0,
  masterVolume: 0.8,
  activeBank: 'A',
  banks: { A: [], B: [], C: [], D: [] },
  patterns: { A: {}, B: {}, C: {}, D: {} },
  createdAt: Date.now(),
  updatedAt: Date.now(),
} as unknown as ProjectData;

type SeenRequest = { url: string; method: string; authorization: string | null; organization: string | null };

function makeApi(respond: (url: string, method: string) => Response | Promise<Response> = () => Response.json(record)) {
  const requests: SeenRequest[] = [];
  const api = createCloudProjectApi({
    apiBase,
    getAccessToken: async () => 'verified-access-token',
    fetcher: async (input, init) => {
      const headers = new Headers(init?.headers);
      const url = String(input);
      requests.push({
        url,
        method: init?.method ?? 'GET',
        authorization: headers.get('Authorization'),
        organization: headers.get('x-organization-id'),
      });
      if (url.endsWith('/api/me/organizations')) {
        assert.equal(headers.get('Authorization'), 'Bearer verified-access-token');
        return Response.json({ organizations: [{ id: organizationId }] });
      }
      return respond(String(input), init?.method ?? 'GET');
    },
  });
  return { api, requests };
}

function assertSecureRequest(request: SeenRequest, expectedUrl: string, method: string): void {
  assert.equal(request.url, expectedUrl);
  assert.equal(request.method, method);
  assert.equal(request.authorization, 'Bearer verified-access-token');
  assert.equal(request.organization, organizationId);
}

function projectRequests(requests: SeenRequest[]): SeenRequest[] {
  return requests.filter((request) => !request.url.endsWith('/api/me/organizations'));
}

function assertOrganizationLookup(request: SeenRequest): void {
  assert.equal(request.url, 'https://mpc-staging-backend.onrender.com/api/me/organizations');
  assert.equal(request.method, 'GET');
  assert.equal(request.authorization, 'Bearer verified-access-token');
}

test('project API URLs normalize VITE_API_BASE and preserve same-origin proxy fallback', () => {
  assert.equal(projectApiUrl('/api/projects', apiBase), 'https://mpc-staging-backend.onrender.com/api/projects');
  assert.equal(projectApiUrl('api/projects', 'https://backend.example.test///'), 'https://backend.example.test/api/projects');
  assert.equal(projectApiUrl('/api/projects', ''), '/api/projects');
});

test('list project request targets configured backend with bearer and organization headers', async () => {
  const { api, requests } = makeApi(() => Response.json({ projects: [record] }));
  const listed = await api.list();
  assert.equal(listed.length, 1);
  assertOrganizationLookup(requests[0]);
  assertSecureRequest(projectRequests(requests)[0], 'https://mpc-staging-backend.onrender.com/api/projects', 'GET');
});

test('create and update project requests target configured backend and retain auth context', async () => {
  const { api, requests } = makeApi((_url, method) => Response.json({ ...record, ...(method === 'PATCH' ? { name: 'Updated Beat' } : {}) }, { status: method === 'POST' ? 201 : 200 }));
  await api.save(project);
  await api.save({ ...project, id: projectId });
  assertOrganizationLookup(requests[0]);
  assertOrganizationLookup(requests[2]);
  assertSecureRequest(projectRequests(requests)[0], 'https://mpc-staging-backend.onrender.com/api/projects', 'POST');
  assertSecureRequest(projectRequests(requests)[1], `https://mpc-staging-backend.onrender.com/api/projects/${projectId}`, 'PATCH');
});

test('load and delete project requests target configured backend and retain auth context', async () => {
  const { api, requests } = makeApi((_url, method) => method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json(record));
  await api.load(projectId);
  await api.delete(projectId);
  assertOrganizationLookup(requests[0]);
  assertOrganizationLookup(requests[2]);
  assertSecureRequest(projectRequests(requests)[0], `https://mpc-staging-backend.onrender.com/api/projects/${projectId}`, 'GET');
  assertSecureRequest(projectRequests(requests)[1], `https://mpc-staging-backend.onrender.com/api/projects/${projectId}`, 'DELETE');
});

test('non-JSON cloud error remains a typed error with safe status and fallback message', async () => {
  const { api } = makeApi(() => new Response('<html>upstream failure</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(() => api.list(), (error: unknown) => {
    assert.ok(error instanceof CloudProjectError);
    assert.equal(error.status, 502);
    assert.equal(error.message, 'Cloud project request failed');
    return true;
  });
});

test('successful non-JSON cloud response fails safely instead of leaking a parser error', async () => {
  const { api } = makeApi(() => new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } }));
  await assert.rejects(() => api.list(), (error: unknown) => {
    assert.ok(error instanceof CloudProjectError);
    assert.equal(error.status, 200);
    assert.equal(error.message, 'Cloud project service returned an invalid response');
    return true;
  });
});

test('network failures remain visible as cloud service errors', async () => {
  const { api } = makeApi(() => { throw new TypeError('private low-level transport detail'); });
  await assert.rejects(() => api.list(), (error: unknown) => {
    assert.ok(error instanceof CloudProjectError);
    assert.equal(error.status, 0);
    assert.equal(error.message, 'Cloud project service is unavailable');
    return true;
  });
});
