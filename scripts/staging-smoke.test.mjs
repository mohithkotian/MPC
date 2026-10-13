import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPreDeploymentReadiness } from './staging-smoke.mjs';

function jsonResponse(body, status = 200) {
  return {
    status,
    headers: { get() { return null; } },
    async json() { return body; },
  };
}

test('pre-deployment readiness retries a transient failure and accepts a ready response', async () => {
  const responses = [
    new TypeError('temporary network failure'),
    jsonResponse({ error: 'starting' }, 503),
    jsonResponse({ status: 'ready' }, 200),
  ];
  const calls = [];
  const delays = [];

  const result = await checkPreDeploymentReadiness({
    backendUrl: 'https://staging.example.test',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    delay: async (milliseconds) => delays.push(milliseconds),
    log() {},
    error() {},
  });

  assert.equal(result, true);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(({ url }) => url), [
    'https://staging.example.test/api/ready',
    'https://staging.example.test/api/ready',
    'https://staging.example.test/api/ready',
  ]);
  assert.equal(delays.length, 2);
  assert.ok(delays.every((milliseconds) => milliseconds > 0));
});

test('persistent readiness failure fails closed after three attempts', async () => {
  let attempts = 0;
  const delays = [];

  const result = await checkPreDeploymentReadiness({
    backendUrl: 'https://staging.example.test',
    fetchImpl: async () => {
      attempts += 1;
      throw new TypeError('staging backend unavailable');
    },
    delay: async (milliseconds) => delays.push(milliseconds),
    log() {},
    error() {},
  });

  assert.equal(result, false);
  assert.equal(attempts, 3);
  assert.equal(delays.length, 2);
});

test('readiness requires exactly HTTP 200 with a ready status', async () => {
  let attempts = 0;

  const result = await checkPreDeploymentReadiness({
    backendUrl: 'https://staging.example.test',
    fetchImpl: async () => {
      attempts += 1;
      return jsonResponse({ status: 'starting' }, 200);
    },
    delay: async () => assert.fail('non-transient readiness response must not retry'),
    log() {},
    error() {},
  });

  assert.equal(result, false);
  assert.equal(attempts, 1);
});
