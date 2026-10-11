#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireStagingToken, validateStagingAuthConfig, verifyStagingSupabaseUser } from './staging-smoke-auth.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function httpsOrigin(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must use HTTPS and contain no credentials, query, or fragment`);
  }
  return value.replace(/\/$/, '');
}

export function validateStagingConfig(env = process.env) {
  const backendUrl = env.STAGING_BASE_URL ?? env.STAGING_BACKEND_URL ?? env.STAGING_API_BASE ?? '';
  const authConfig = {
    supabaseUrl: env.STAGING_SUPABASE_URL,
    anonKey: env.STAGING_SUPABASE_ANON_KEY,
    email: env.STAGING_TEST_USER_EMAIL,
    password: env.STAGING_TEST_USER_PASSWORD,
  };
  const missing = [
    ['STAGING_BACKEND_URL', backendUrl],
    ['STAGING_ORGANIZATION_ID', env.STAGING_ORGANIZATION_ID],
    ['STAGING_SAMPLE_ID', env.STAGING_SAMPLE_ID],
  ].filter(([, value]) => !requiredValue(value)).map(([name]) => name);
  try {
    validateStagingAuthConfig(authConfig);
  } catch (error) {
    const missingAuth = error.message.match(/Missing required staging Supabase secrets: (.+)$/)?.[1];
    if (missingAuth) missing.push(...missingAuth.split(', '));
    else throw error;
  }
  if (missing.length) throw new Error(`Missing required staging configuration: ${[...new Set(missing)].join(', ')}`);

  const normalizedBackendUrl = httpsOrigin(backendUrl.trim(), 'STAGING_BACKEND_URL');
  if (!UUID_PATTERN.test(env.STAGING_ORGANIZATION_ID) || !UUID_PATTERN.test(env.STAGING_SAMPLE_ID)) {
    throw new Error('STAGING_ORGANIZATION_ID and STAGING_SAMPLE_ID must be UUIDs');
  }
  if (env.STAGING_MISSING_SAMPLE_ID && !UUID_PATTERN.test(env.STAGING_MISSING_SAMPLE_ID)) {
    throw new Error('STAGING_MISSING_SAMPLE_ID must be a UUID when supplied');
  }
  return {
    backendUrl: normalizedBackendUrl,
    authConfig: validateStagingAuthConfig(authConfig),
    organizationId: env.STAGING_ORGANIZATION_ID,
    sampleId: env.STAGING_SAMPLE_ID,
    missingSampleId: env.STAGING_MISSING_SAMPLE_ID || randomUUID(),
    smokeProjectPrefix: env.STAGING_SMOKE_PROJECT || 'mpc-ci-smoke',
  };
}

function maskTokenForGithub(token) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const escaped = token.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  process.stdout.write(`::add-mask::${escaped}\n`);
}

async function readJson(response) {
  try { return await response.json(); } catch { return null; }
}

export async function runSmoke({
  env = process.env,
  fetchImpl = globalThis.fetch,
  log = console.log,
  error = console.error,
  maskToken = maskTokenForGithub,
} = {}) {
  let config;
  try {
    config = validateStagingConfig(env);
  } catch (cause) {
    error(`BLOCKED: ${cause.message}`);
    return 2;
  }

  let failures = 0;
  const authHeaders = () => ({
    authorization: `Bearer ${accessToken}`,
    'x-organization-id': config.organizationId,
  });

  async function check(name, path, expectedStatus, options = {}) {
    let response;
    try {
      response = await fetchImpl(`${config.backendUrl}${path}`, {
        ...options,
        headers: { accept: 'application/json', ...(options.headers ?? {}) },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      error(`FAIL ${name}: request could not be completed`);
      failures += 1;
      return null;
    }
    const requestId = response.headers?.get?.('x-request-id') ?? '(missing)';
    const passed = response.status === expectedStatus;
    log(`${passed ? 'PASS' : 'FAIL'} ${name}: HTTP ${response.status}; request_id=${requestId}`);
    if (!passed) failures += 1;
    return response;
  }

  const health = await check('liveness', '/api/health', 200);
  if (health) {
    const body = await readJson(health);
    if (body?.status !== 'ok') { error('FAIL liveness body: status was not ok'); failures += 1; }
  }
  const ready = await check('readiness', '/api/ready', 200);
  if (ready) {
    const body = await readJson(ready);
    if (body?.status !== 'ready') { error('FAIL readiness body: status was not ready'); failures += 1; }
  }
  await check('unauthenticated protected request', '/api/auth/session', 401);

  let accessToken;
  let verifiedUser;
  try {
    ({ accessToken } = await acquireStagingToken({ ...config.authConfig, fetchImpl, maskToken }));
    verifiedUser = await verifyStagingSupabaseUser({
      supabaseUrl: config.authConfig.supabaseUrl,
      anonKey: config.authConfig.anonKey,
      accessToken,
      expectedEmail: config.authConfig.email,
      fetchImpl,
    });
    log('PASS staging Supabase test-account authentication and identity verification');
  } catch (cause) {
    error(`FAIL staging Supabase test-account authentication: ${cause.message}`);
    failures += 1;
    return failures > 0 ? 1 : 0;
  }

  const verifiedSession = await check('backend verifies staging test-account session', '/api/auth/session', 200, { headers: authHeaders() });
  if (verifiedSession) {
    const body = await readJson(verifiedSession);
    if (body?.user?.id !== verifiedUser.id) {
      error('FAIL backend session identity did not match the Supabase-verified test account');
      failures += 1;
    }
  }

  let isOrganizationMember = false;
  const organizations = await check('staging organization membership lookup', '/api/me/organizations', 200, { headers: authHeaders() });
  if (organizations) {
    const body = await readJson(organizations);
    isOrganizationMember = Array.isArray(body?.organizations) && body.organizations.some((organization) => organization?.id === config.organizationId);
    if (!isOrganizationMember) {
      error('FAIL staging test account is not a member of STAGING_ORGANIZATION_ID');
      failures += 1;
    } else {
      log('PASS staging test account belongs to the configured organization');
    }
  }

  let sampleIsInOrganization = false;
  const manifest = await check('staging organization sample manifest', '/api/audio/manifest', 200, { headers: authHeaders() });
  if (manifest) {
    const body = await readJson(manifest);
    sampleIsInOrganization = Boolean(body && Object.prototype.hasOwnProperty.call(body, config.sampleId));
    if (!sampleIsInOrganization) {
      error('FAIL STAGING_SAMPLE_ID is not present in the configured staging organization manifest');
      failures += 1;
    } else {
      log('PASS designated sample is listed in the configured staging organization');
    }
  }

  if (isOrganizationMember && sampleIsInOrganization) {
    await check('missing private sample is non-enumerating', `/api/audio/stream/${config.missingSampleId}`, 404, { headers: authHeaders() });
    const audio = await check('authorized private sample access', `/api/audio/stream/${config.sampleId}`, 200, {
      headers: { ...authHeaders(), 'cache-control': 'no-store' },
    });
    if (audio) {
      if (!audio.headers?.get?.('content-type')?.toLowerCase().startsWith('audio/')) {
        error('FAIL authorized private sample: content type was not audio'); failures += 1;
      }
      if (audio.headers?.has?.('location')) {
        error('FAIL authorized private sample: redirect/public URL was returned'); failures += 1;
      }
      const reader = audio.body?.getReader?.();
      if (!reader) {
        error('FAIL authorized private sample: response body was not readable'); failures += 1;
      } else {
        let consumed = 0;
        try {
          while (consumed < 64 * 1024) {
            const chunk = await reader.read();
            if (chunk.done) break;
            consumed += chunk.value.byteLength;
          }
        } catch {
          error('FAIL authorized private sample: audio stream could not be read'); failures += 1;
        } finally {
          try { await reader.cancel(); } catch { /* stream may already be closed */ }
        }
      }
    }

    const projectBody = {
      name: `${config.smokeProjectPrefix}-${Date.now()}-${randomUUID().slice(0, 8)}`,
      artist: 'MPC CI smoke test', bpm: 120, swing: 0, volume: 0.8, bank: 'A',
      snapshot: { activeBank: 'A', banks: { A: [], B: [], C: [], D: [] }, patterns: { A: {}, B: {}, C: {}, D: {} } },
    };
    let projectId;
    try {
      const created = await check('project create', '/api/projects', 201, {
        method: 'POST', headers: { ...authHeaders(), 'content-type': 'application/json' }, body: JSON.stringify(projectBody),
      });
      if (created) {
        const body = await readJson(created);
        projectId = body?.id;
        if (typeof projectId !== 'string' || !UUID_PATTERN.test(projectId)) {
          error('FAIL project create: response did not contain a UUID id'); failures += 1; projectId = undefined;
        }
      }
      if (projectId) {
        const listed = await check('project list', '/api/projects', 200, { headers: authHeaders() });
        if (listed) {
          const body = await readJson(listed);
          if (!body?.projects?.some((project) => project.id === projectId)) {
            error('FAIL project list: created project was not listed'); failures += 1;
          }
        }
        const updated = await check('project update', `/api/projects/${projectId}`, 200, {
          method: 'PATCH',
          headers: { ...authHeaders(), 'content-type': 'application/json' },
          body: JSON.stringify({ ...projectBody, name: `${projectBody.name}-updated` }),
        });
        if (updated) {
          const body = await readJson(updated);
          if (body?.name !== `${projectBody.name}-updated`) {
            error('FAIL project update: updated name was not persisted'); failures += 1;
          }
        }
      }
    } finally {
      if (projectId) await check('project cleanup', `/api/projects/${projectId}`, 204, { method: 'DELETE', headers: authHeaders() });
    }
  }

  if (failures > 0) return 1;
  log('PASS staging smoke test completed: health, readiness, runtime auth, tenant membership, private sample access, and project lifecycle checks passed.');
  return 0;
}

export async function runPreflight({
  env = process.env,
  fetchImpl = globalThis.fetch,
  log = console.log,
  error = console.error,
  maskToken = maskTokenForGithub,
} = {}) {
  let config;
  try {
    config = validateStagingConfig(env);
  } catch (cause) {
    error(`BLOCKED: ${cause.message}`);
    return 2;
  }

  let accessToken;
  let verifiedUser;
  try {
    ({ accessToken } = await acquireStagingToken({ ...config.authConfig, fetchImpl, maskToken }));
    verifiedUser = await verifyStagingSupabaseUser({
      supabaseUrl: config.authConfig.supabaseUrl,
      anonKey: config.authConfig.anonKey,
      accessToken,
      expectedEmail: config.authConfig.email,
      fetchImpl,
    });
    log('PASS staging Supabase test-account authentication and identity verification');
  } catch (cause) {
    error(`FAIL staging Supabase test-account authentication: ${cause.message}`);
    return 1;
  }

  let failures = 0;
  const headers = {
    authorization: `Bearer ${accessToken}`,
    'x-organization-id': config.organizationId,
  };
  async function request(name, path, options = {}) {
    try {
      const response = await fetchImpl(`${config.backendUrl}${path}`, {
        ...options,
        headers: { accept: 'application/json', ...(options.headers ?? {}) },
        signal: AbortSignal.timeout(15_000),
      });
      const requestId = response.headers?.get?.('x-request-id') ?? '(missing)';
      log(`${response.ok ? 'PASS' : 'FAIL'} ${name}: HTTP ${response.status}; request_id=${requestId}`);
      if (!response.ok) failures += 1;
      return response;
    } catch {
      error(`FAIL ${name}: request could not be completed`);
      failures += 1;
      return null;
    }
  }

  const ready = await request('existing staging readiness before deployment', '/api/ready');
  if (ready && (await readJson(ready))?.status !== 'ready') {
    error('FAIL existing staging readiness body: status was not ready'); failures += 1;
  }

  const session = await request('existing backend verifies staging test-account identity', '/api/auth/session', { headers });
  if (session && (await readJson(session))?.user?.id !== verifiedUser.id) {
    error('FAIL backend session identity did not match the Supabase-verified test account'); failures += 1;
  }

  let isOrganizationMember = false;
  const organizations = await request('existing backend organization membership check', '/api/me/organizations', { headers });
  if (organizations) {
    const body = await readJson(organizations);
    isOrganizationMember = Array.isArray(body?.organizations) && body.organizations.some((organization) => organization?.id === config.organizationId);
    if (!isOrganizationMember) {
      error('FAIL staging test account is not a member of STAGING_ORGANIZATION_ID'); failures += 1;
    } else {
      log('PASS staging test account belongs to the configured organization');
    }
  }

  let sampleIsInOrganization = false;
  const manifest = await request('existing backend organization sample manifest check', '/api/audio/manifest', { headers });
  if (manifest) {
    const body = await readJson(manifest);
    sampleIsInOrganization = Boolean(body && Object.prototype.hasOwnProperty.call(body, config.sampleId));
    if (!sampleIsInOrganization) {
      error('FAIL STAGING_SAMPLE_ID is not present in the configured staging organization manifest'); failures += 1;
    } else {
      log('PASS designated sample is listed in the configured staging organization');
    }
  }

  if (isOrganizationMember && sampleIsInOrganization) {
    const audio = await request('existing backend authorized sample access check', `/api/audio/stream/${config.sampleId}`, {
      headers: { ...headers, 'cache-control': 'no-store' },
    });
    if (audio) {
      if (!audio.ok || !audio.headers?.get?.('content-type')?.toLowerCase().startsWith('audio/') || audio.headers?.has?.('location')) {
        error('FAIL existing backend did not return authorized private audio directly'); failures += 1;
      } else {
        const reader = audio.body?.getReader?.();
        if (!reader) {
          error('FAIL existing backend authorized sample response had no readable body'); failures += 1;
        } else {
          try {
            const chunk = await reader.read();
            if (chunk.done || !chunk.value?.byteLength) { error('FAIL existing backend authorized sample was empty'); failures += 1; }
          } catch {
            error('FAIL existing backend authorized sample stream could not be read'); failures += 1;
          } finally {
            try { await reader.cancel(); } catch { /* stream may already be closed */ }
          }
        }
      }
    }
  }

  if (failures > 0) return 1;
  log('PASS read-only staging configuration preflight; no Render deploy hook was called.');
  return 0;
}

async function main() {
  if (process.argv.includes('--validate-config')) {
    try {
      validateStagingConfig(process.env);
      console.log('PASS staging configuration is present and uses a non-service-role Supabase key.');
      return 0;
    } catch (cause) {
      console.error(`BLOCKED: ${cause.message}`);
      return 2;
    }
  }
  if (process.argv.includes('--preflight')) return runPreflight();
  return runSmoke();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
