import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireStagingToken,
  validateStagingAuthConfig,
  verifyStagingSupabaseUser,
} from './staging-smoke-auth.mjs';

const anonKey = `header.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.signature`;
const validConfig = {
  supabaseUrl: 'https://staging-project.supabase.co',
  anonKey,
  email: 'mpc-ci@example.test',
  password: 'unit-test-password-not-a-real-secret',
};

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('missing staging auth credentials fail before making a network request', () => {
  assert.throws(
    () => validateStagingAuthConfig({}),
    /STAGING_SUPABASE_URL.*STAGING_SUPABASE_ANON_KEY.*STAGING_TEST_USER_EMAIL.*STAGING_TEST_USER_PASSWORD/,
  );
});

test('token acquisition does not send a request when credentials are missing', async () => {
  let called = false;
  await assert.rejects(
    acquireStagingToken({ fetchImpl: async () => { called = true; return jsonResponse({}); } }),
    /Missing required staging Supabase secrets/,
  );
  assert.equal(called, false);
});

test('failed password authentication returns a generic error without credential details', async () => {
  let called = false;
  await assert.rejects(
    acquireStagingToken({
      ...validConfig,
      fetchImpl: async () => { called = true; return jsonResponse({ msg: 'credentials rejected' }, 400); },
      maskToken() {},
    }),
    (error) => {
      assert.match(error.message, /Supabase rejected staging test-account authentication/);
      assert.equal(error.message.includes(validConfig.password), false);
      assert.equal(error.message.includes(validConfig.email), false);
      return true;
    },
  );
  assert.equal(called, true);
});

test('an already-expired access-token response is rejected and the token is masked first', async () => {
  const masked = [];
  await assert.rejects(
    acquireStagingToken({
      ...validConfig,
      now: () => 2_000_000,
      fetchImpl: async () => jsonResponse({
        access_token: 'expired-test-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 1000,
      }),
      maskToken: (token) => masked.push(token),
    }),
    /Supabase returned an expired or invalid staging session/,
  );
  assert.deepEqual(masked, ['expired-test-access-token']);
});

test('expired or revoked session is rejected during Auth user verification', async () => {
  await assert.rejects(
    verifyStagingSupabaseUser({
      supabaseUrl: validConfig.supabaseUrl,
      anonKey,
      accessToken: 'expired-access-token',
      expectedEmail: validConfig.email,
      fetchImpl: async () => jsonResponse({ msg: 'JWT expired' }, 401),
    }),
    (error) => {
      assert.match(error.message, /staging Supabase session is expired or invalid/i);
      assert.equal(error.message.includes('expired-access-token'), false);
      return true;
    },
  );
});

test('successful password authentication returns only the short-lived access token and masks it', async () => {
  const token = 'short-lived-access-token';
  const masked = [];
  const calls = [];
  const result = await acquireStagingToken({
    ...validConfig,
    now: () => 1_000_000,
    maskToken: (value) => masked.push(value),
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return jsonResponse({
        access_token: token,
        refresh_token: 'refresh-token-must-not-be-returned-or-used',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 4600,
      });
    },
  });

  assert.equal(result.accessToken, token);
  assert.equal(result.expiresAt, 4600);
  assert.deepEqual(masked, [token]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://staging-project.supabase.co/auth/v1/token?grant_type=password');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.apikey, anonKey);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    email: validConfig.email,
    password: validConfig.password,
  });
  assert.equal(Object.hasOwn(result, 'refreshToken'), false);
});

test('service-role keys are rejected before password authentication', async () => {
  const serviceRoleKey = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  let called = false;
  await assert.rejects(
    acquireStagingToken({
      ...validConfig,
      anonKey: serviceRoleKey,
      fetchImpl: async () => { called = true; return jsonResponse({}); },
      maskToken() {},
    }),
    /must be a Supabase anon or publishable key/,
  );
  assert.equal(called, false);
});

test('Supabase user verification returns only the matching account identifier', async () => {
  const result = await verifyStagingSupabaseUser({
    supabaseUrl: validConfig.supabaseUrl,
    anonKey,
    accessToken: 'short-lived-access-token',
    expectedEmail: validConfig.email,
    fetchImpl: async (url, options) => {
      assert.equal(String(url), 'https://staging-project.supabase.co/auth/v1/user');
      assert.equal(options.headers.apikey, anonKey);
      assert.equal(options.headers.authorization, 'Bearer short-lived-access-token');
      return jsonResponse({ id: '3e8f2f93-f663-4e71-a9fc-31c9d44eab65', email: 'MPC-CI@example.test' });
    },
  });
  assert.deepEqual(result, { id: '3e8f2f93-f663-4e71-a9fc-31c9d44eab65' });
  assert.equal(Object.hasOwn(result, 'email'), false);
});

test('Supabase user verification rejects a different account without exposing identities', async () => {
  await assert.rejects(
    verifyStagingSupabaseUser({
      supabaseUrl: validConfig.supabaseUrl,
      anonKey,
      accessToken: 'short-lived-access-token',
      expectedEmail: validConfig.email,
      fetchImpl: async () => jsonResponse({ id: '3e8f2f93-f663-4e71-a9fc-31c9d44eab65', email: 'other@example.test' }),
    }),
    (error) => {
      assert.match(error.message, /different staging test account/);
      assert.equal(error.message.includes('other@example.test'), false);
      assert.equal(error.message.includes(validConfig.email), false);
      return true;
    },
  );
});
