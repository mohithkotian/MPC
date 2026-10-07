import { createDatabasePool, withTransaction } from './client';

const environment = process.env.NODE_ENV ?? 'development';
if (environment === 'production') {
  throw new Error('Refusing to seed production. This command is development/test-only.');
}
if (!['development', 'test'].includes(environment)) {
  throw new Error(`Refusing to seed unknown environment: ${environment}`);
}

const pool = createDatabasePool();
try {
  await withTransaction(pool, async (client) => {
    const alphaUser = await client.query<{ id: string }>(
      `INSERT INTO auth.users (id, email)
       VALUES (gen_random_uuid(), 'test-owner-alpha@example.invalid')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
    );
    const betaUser = await client.query<{ id: string }>(
      `INSERT INTO auth.users (id, email)
       VALUES (gen_random_uuid(), 'test-owner-beta@example.invalid')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
    );

    const alphaUserId = alphaUser.rows[0].id;
    const betaUserId = betaUser.rows[0].id;

    await client.query(
      `INSERT INTO public.profiles (id, display_name)
       VALUES ($1, 'Synthetic Alpha Owner'), ($2, 'Synthetic Beta Owner')
       ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name`,
      [alphaUserId, betaUserId],
    );

    const organizations = await client.query<{ id: string; slug: string }>(
      `INSERT INTO public.organizations (name, slug, created_by)
       VALUES ('Synthetic Organization Alpha', 'synthetic-alpha', $1),
              ('Synthetic Organization Beta', 'synthetic-beta', $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, slug`,
      [alphaUserId, betaUserId],
    );

    const alphaOrganization = organizations.rows.find((row) => row.slug === 'synthetic-alpha');
    const betaOrganization = organizations.rows.find((row) => row.slug === 'synthetic-beta');
    if (!alphaOrganization || !betaOrganization) {
      throw new Error('Synthetic organizations were not created');
    }

    await client.query(
      `INSERT INTO public.organization_members (organization_id, user_id, role)
       VALUES ($1, $2, 'owner'), ($3, $4, 'owner')
       ON CONFLICT (organization_id, user_id, deleted_at) DO NOTHING`,
      [alphaOrganization.id, alphaUserId, betaOrganization.id, betaUserId],
    );

    console.log('[Database] Seeded synthetic development/test organizations only.');
    console.log(`[Database] Alpha organization: ${alphaOrganization.id}`);
    console.log(`[Database] Beta organization: ${betaOrganization.id}`);
  });
} finally {
  await pool.end();
}
