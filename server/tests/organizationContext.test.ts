import assert from 'node:assert/strict';
import test from 'node:test';
import { getActiveOrganizationId, OrganizationContextError, organizationRequestHeaders } from '../../src/services/auth/organizationContext';

const firstOrganizationId = '33333333-3333-4333-8333-333333333333';
const secondOrganizationId = '55555555-5555-4555-8555-555555555555';

test('active organization context uses the first server-ordered member organization', async () => {
  let requestUrl = '';
  let requestAuthorization = '';
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
    return new Response(JSON.stringify({ organizations: [{ id: firstOrganizationId }, { id: secondOrganizationId }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const selected = await getActiveOrganizationId('verified-access-token', fetcher, 'https://api.example.test');

  assert.equal(selected, firstOrganizationId);
  assert.equal(requestUrl, 'https://api.example.test/api/me/organizations');
  assert.equal(requestAuthorization, 'Bearer verified-access-token');
});

test('authenticated organization headers carry the selected tenant id', () => {
  assert.deepEqual(organizationRequestHeaders('verified-access-token', firstOrganizationId), {
    Authorization: 'Bearer verified-access-token',
    'x-organization-id': firstOrganizationId,
  });
});

test('active organization context fails closed when no memberships are returned', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ organizations: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  await assert.rejects(
    () => getActiveOrganizationId('verified-access-token', fetcher, 'https://api.example.test'),
    (error: unknown) => error instanceof OrganizationContextError && error.status === 403,
  );
});
