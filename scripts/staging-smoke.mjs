#!/usr/bin/env node
import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.STAGING_BASE_URL ?? process.env.STAGING_API_BASE ?? '').replace(/\/$/, '');
const accessToken = process.env.STAGING_ACCESS_TOKEN ?? process.env.STAGING_BEARER_TOKEN;
const organizationId = process.env.STAGING_ORGANIZATION_ID;
const sampleId = process.env.STAGING_SAMPLE_ID;
const missingSampleId = process.env.STAGING_MISSING_SAMPLE_ID ?? randomUUID();
const smokeProjectPrefix = process.env.STAGING_SMOKE_PROJECT ?? 'mpc-ci-smoke';

let failures = 0;
let blocked = 0;

if (!baseUrl) {
  console.error('BLOCKED: STAGING_BASE_URL or STAGING_API_BASE is required; no live staging check was run.');
  process.exit(2);
}
if (!/^https:\/\//i.test(baseUrl)) {
  console.error('FAIL: staging base URL must use HTTPS.');
  process.exit(1);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
}

async function check(name, path, expectedStatus, options = {}) {
  try {
    const response = await request(path, options);
    const requestId = response.headers.get('x-request-id') ?? '(missing)';
    const passed = response.status === expectedStatus;
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: HTTP ${response.status}; request_id=${requestId}`);
    if (!passed) failures += 1;
    return response;
  } catch (error) {
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    failures += 1;
    return null;
  }
}

const health = await check('liveness', '/api/health', 200);
if (health) {
  try {
    const body = await health.json();
    if (body.status !== 'ok') { console.error('FAIL liveness body: status was not ok'); failures += 1; }
  } catch { console.error('FAIL liveness body: response was not JSON'); failures += 1; }
}
const ready = await check('readiness', '/api/ready', 200);
if (ready) {
  try {
    const body = await ready.json();
    if (body.status !== 'ready') { console.error('FAIL readiness body: status was not ready'); failures += 1; }
  } catch { console.error('FAIL readiness body: response was not JSON'); failures += 1; }
}
await check('unauthenticated protected request', '/api/auth/session', 401);

const required = [
  ['STAGING_ACCESS_TOKEN or STAGING_BEARER_TOKEN', accessToken],
  ['STAGING_ORGANIZATION_ID', organizationId],
  ['STAGING_SAMPLE_ID', sampleId],
];
const missing = required.filter(([, value]) => !value).map(([name]) => name);
if (missing.length > 0) {
  console.log(`BLOCKED authenticated staging checks: missing ${missing.join(', ')}.`);
  blocked += 1;
} else if (!isUuid(organizationId) || !isUuid(sampleId) || !isUuid(missingSampleId)) {
  console.error('FAIL staging fixture identifiers must be UUIDs.');
  failures += 1;
} else {
  const authHeaders = { Authorization: `Bearer ${accessToken}`, 'x-organization-id': organizationId };
  await check('authenticated session', '/api/auth/session', 200, { headers: authHeaders });
  await check('private sample manifest', '/api/audio/manifest', 200, { headers: authHeaders });
  await check('missing private sample is non-enumerating', `/api/audio/stream/${missingSampleId}`, 404, { headers: authHeaders });

  const audio = await check('authorized private audio', `/api/audio/stream/${sampleId}`, 200, { headers: { ...authHeaders, 'cache-control': 'no-store' } });
  if (audio) {
    if (!audio.headers.get('content-type')?.toLowerCase().startsWith('audio/')) { console.error('FAIL authorized private audio: content type was not audio'); failures += 1; }
    if (audio.headers.has('location')) { console.error('FAIL authorized private audio: redirect/public URL was returned'); failures += 1; }
    const reader = audio.body?.getReader();
    if (!reader) { console.error('FAIL authorized private audio: response body was not readable'); failures += 1; }
    else {
      let consumed = 0;
      try {
        while (consumed < 64 * 1024) {
          const chunk = await reader.read();
          if (chunk.done) break;
          consumed += chunk.value.byteLength;
        }
      } finally { await reader.cancel(); }
    }
  }

  const projectBody = {
    name: `${smokeProjectPrefix}-${Date.now()}-${randomUUID().slice(0, 8)}`,
    artist: 'MPC CI smoke test', bpm: 120, swing: 0, volume: 0.8, bank: 'A',
    snapshot: { activeBank: 'A', banks: { A: [], B: [], C: [], D: [] }, patterns: { A: {}, B: {}, C: {}, D: {} } },
  };
  let projectId;
  try {
    const created = await check('project create', '/api/projects', 201, { method: 'POST', headers: { ...authHeaders, 'content-type': 'application/json' }, body: JSON.stringify(projectBody) });
    if (created) {
      const body = await created.json();
      projectId = body.id;
      if (!isUuid(projectId)) { console.error('FAIL project create: response did not contain a UUID id'); failures += 1; }
    }
    if (projectId) {
      const listed = await check('project list', '/api/projects', 200, { headers: authHeaders });
      if (listed && !(await listed.json()).projects?.some((project) => project.id === projectId)) { console.error('FAIL project list: created project was not listed'); failures += 1; }
      const updated = await check('project update', `/api/projects/${projectId}`, 200, { method: 'PATCH', headers: { ...authHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ ...projectBody, name: `${projectBody.name}-updated` }) });
      if (updated && (await updated.json()).name !== `${projectBody.name}-updated`) { console.error('FAIL project update: updated name was not persisted'); failures += 1; }
    }
  } finally {
    if (projectId) await check('project cleanup', `/api/projects/${projectId}`, 204, { method: 'DELETE', headers: authHeaders });
  }
}

if (failures > 0) process.exitCode = 1;
else if (blocked > 0) process.exitCode = 2;
else console.log('PASS staging smoke test completed: health, readiness, auth, private audio, and project lifecycle checks passed.');
