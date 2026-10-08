import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { applyMigration } from '../client';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Set TEST_DATABASE_URL or DATABASE_URL to a disposable PostgreSQL database');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : undefined,
});

async function resetDatabase(): Promise<void> {
  await pool.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    DROP SCHEMA IF EXISTS app CASCADE;
    CREATE SCHEMA public;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE
    );
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS UUID
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
    END
    $$;
  `);
}

async function assert(condition: unknown, message: string): Promise<void> {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function expectRejected(operation: () => Promise<unknown>, message: string): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  await assert(rejected, message);
}

async function asAuthenticated<T>(
  userId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SET ROLE authenticated');
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    return await operation(client);
  } finally {
    await client.query('RESET ROLE');
    await client.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
    client.release();
  }
}

async function run(): Promise<void> {
  await resetDatabase();
  await applyMigration(pool, '0001_multi_tenant_foundation.up.sql');

  const tables = await pool.query<{ relname: string; relrowsecurity: boolean }>(
    `SELECT relname, relrowsecurity
     FROM pg_class
     WHERE relnamespace = 'public'::regnamespace
       AND relname IN ('profiles', 'organizations', 'organization_members', 'samples', 'audit_events')`,
  );
  await assert(tables.rows.length === 5, 'all five application tables should exist');
  await assert(tables.rows.every((table) => table.relrowsecurity), 'RLS should be enabled on every application table');

  const alphaUser = randomUUID();
  const alphaViewer = randomUUID();
  const alphaMember = randomUUID();
  const alphaAdmin = randomUUID();
  const removedUser = randomUUID();
  const betaUser = randomUUID();
  const users = [alphaUser, alphaViewer, alphaMember, alphaAdmin, removedUser, betaUser];
  await pool.query(
    `INSERT INTO auth.users (id, email)
     SELECT user_id, 'user-' || user_id || '@example.invalid'
     FROM unnest($1::uuid[]) AS user_id`,
    [users],
  );
  await pool.query(
    `INSERT INTO public.profiles (id, display_name)
     SELECT user_id, 'Synthetic ' || user_id
     FROM unnest($1::uuid[]) AS user_id`,
    [users],
  );

  const organizations = await pool.query<{ id: string; slug: string }>(
    `INSERT INTO public.organizations (name, slug, created_by)
     VALUES ('Synthetic Alpha', 'test-alpha', $1), ('Synthetic Beta', 'test-beta', $2)
     RETURNING id, slug`,
    [alphaUser, betaUser],
  );
  const alphaOrganization = organizations.rows.find((row) => row.slug === 'test-alpha');
  const betaOrganization = organizations.rows.find((row) => row.slug === 'test-beta');
  if (!alphaOrganization || !betaOrganization) {
    throw new Error('synthetic organizations should exist');
  }

  await pool.query(
    `INSERT INTO public.organization_members (organization_id, user_id, role)
     VALUES
       ($1, $2, 'owner'),
       ($1, $3, 'viewer'),
       ($1, $4, 'member'),
       ($1, $5, 'admin'),
       ($1, $6, 'member'),
       ($7, $8, 'owner')`,
    [
      alphaOrganization.id,
      alphaUser,
      alphaViewer,
      alphaMember,
      alphaAdmin,
      removedUser,
      betaOrganization.id,
      betaUser,
    ],
  );

  const alphaSample = randomUUID();
  const betaSample = randomUUID();
  await pool.query(
    `INSERT INTO public.samples
      (id, organization_id, uploaded_by, storage_key, original_name, content_type, byte_size, status)
     VALUES
      ($1, $3, $2, 'test-alpha/sample-a', 'alpha.mp3', 'audio/mpeg', 100, 'ready'),
      ($4, $5, $6, 'test-beta/sample-b', 'beta.mp3', 'audio/mpeg', 100, 'ready')`,
    [alphaSample, alphaUser, alphaOrganization.id, betaSample, betaOrganization.id, betaUser],
  );

  const anonClient = await pool.connect();
  try {
    await anonClient.query('SET ROLE anon');
    await expectRejected(
      () => anonClient.query('SELECT app.is_active_member($1, $2)', [alphaOrganization.id, alphaUser]),
      'anon must not execute app.is_active_member directly',
    );
  } finally {
    await anonClient.query('RESET ROLE');
    anonClient.release();
  }

  const ownerSamples = await asAuthenticated(alphaUser, (client) =>
    client.query<{ id: string }>('SELECT id FROM public.samples ORDER BY id'),
  );
  await assert(ownerSamples.rows.length === 1, 'owner must see only the active organization sample');
  await assert(ownerSamples.rows[0].id === alphaSample, 'owner must not see the beta sample');

  const crossOrganization = await asAuthenticated(alphaUser, (client) =>
    client.query<{ id: string }>('SELECT id FROM public.samples WHERE id = $1', [betaSample]),
  );
  await assert(crossOrganization.rows.length === 0, 'cross-organization sample lookup must return no rows');

  await pool.query(
    `UPDATE public.organization_members
     SET deleted_at = now()
     WHERE organization_id = $1 AND user_id = $2`,
    [alphaOrganization.id, removedUser],
  );
  const removedMembershipOrganizations = await asAuthenticated(removedUser, (client) =>
    client.query<{ id: string }>('SELECT id FROM public.organizations'),
  );
  await assert(removedMembershipOrganizations.rows.length === 0, 'removed membership must not access the organization');
  const removedMembershipSamples = await asAuthenticated(removedUser, (client) =>
    client.query<{ id: string }>('SELECT id FROM public.samples'),
  );
  await assert(removedMembershipSamples.rows.length === 0, 'removed membership must not access samples');

  const viewerSamples = await asAuthenticated(alphaViewer, (client) =>
    client.query<{ id: string }>('SELECT id FROM public.samples'),
  );
  await assert(viewerSamples.rows.length === 1, 'viewer must be able to SELECT organization samples');
  await expectRejected(
    () => asAuthenticated(alphaViewer, (client) => client.query(
      `INSERT INTO public.samples
        (organization_id, uploaded_by, storage_key, original_name, content_type, byte_size)
       VALUES ($1, $2, 'test-alpha/viewer-forbidden', 'viewer.mp3', 'audio/mpeg', 100)`,
      [alphaOrganization.id, alphaViewer],
    )),
    'viewer must not INSERT samples',
  );
  const viewerUpdate = await asAuthenticated(alphaViewer, (client) => client.query(
      `UPDATE public.samples SET original_name = 'viewer-forbidden.mp3' WHERE id = $1`,
      [alphaSample],
    ));
  await assert(viewerUpdate.rowCount === 0, 'viewer must not UPDATE samples');
  const viewerDelete = await asAuthenticated(alphaViewer, (client) =>
    client.query('DELETE FROM public.samples WHERE id = $1', [alphaSample]),
  );
  await assert(viewerDelete.rowCount === 0, 'viewer must not DELETE samples');

  const memberSample = randomUUID();
  await asAuthenticated(alphaMember, (client) => client.query(
    `INSERT INTO public.samples
      (id, organization_id, uploaded_by, storage_key, original_name, content_type, byte_size)
     VALUES ($1, $2, $3, 'test-alpha/member-sample', 'member.mp3', 'audio/mpeg', 100)`,
    [memberSample, alphaOrganization.id, alphaMember],
  ));
  const memberSamples = await asAuthenticated(alphaMember, (client) =>
    client.query<{ id: string }>('SELECT id FROM public.samples WHERE organization_id = $1', [alphaOrganization.id]),
  );
  await assert(memberSamples.rows.length === 2, 'member must be able to SELECT and INSERT samples');
  const memberUpdate = await asAuthenticated(alphaMember, (client) => client.query(
      `UPDATE public.samples SET original_name = 'member-forbidden.mp3' WHERE id = $1`,
      [alphaSample],
    ));
  await assert(memberUpdate.rowCount === 0, 'member must not UPDATE another user sample');
  const memberDelete = await asAuthenticated(alphaMember, (client) =>
    client.query('DELETE FROM public.samples WHERE id = $1', [memberSample]),
  );
  await assert(memberDelete.rowCount === 0, 'member must not DELETE samples');

  const adminSample = randomUUID();
  await asAuthenticated(alphaAdmin, (client) => client.query(
    `INSERT INTO public.samples
      (id, organization_id, uploaded_by, storage_key, original_name, content_type, byte_size)
     VALUES ($1, $2, $3, 'test-alpha/admin-sample', 'admin.mp3', 'audio/mpeg', 100)`,
    [adminSample, alphaOrganization.id, alphaAdmin],
  ));
  await asAuthenticated(alphaAdmin, (client) => client.query(
    `UPDATE public.samples SET original_name = 'admin-updated.mp3' WHERE id = $1`,
    [alphaSample],
  ));
  const adminUpdated = await asAuthenticated(alphaAdmin, (client) =>
    client.query<{ original_name: string }>('SELECT original_name FROM public.samples WHERE id = $1', [alphaSample]),
  );
  await assert(adminUpdated.rows[0]?.original_name === 'admin-updated.mp3', 'admin must be able to UPDATE samples');
  await asAuthenticated(alphaAdmin, (client) => client.query('DELETE FROM public.samples WHERE id = $1', [adminSample]));
  const adminDeleted = await pool.query('SELECT id FROM public.samples WHERE id = $1', [adminSample]);
  await assert(adminDeleted.rows.length === 0, 'admin must be able to DELETE samples');

  console.log('[Database tests] migration, RLS, anon restriction, membership removal, role matrix, and tenant isolation passed');
}

try {
  await run();
} finally {
  await pool.end();
}
