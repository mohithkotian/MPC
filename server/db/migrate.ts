import { createDatabasePool, applyMigration } from './client';

const migration = process.argv[2] ?? '0001_multi_tenant_foundation.up.sql';
if (!/^[0-9]+_[a-z0-9_-]+\.(up|down)\.sql$/.test(migration)) {
  throw new Error(`Invalid migration filename: ${migration}`);
}

const pool = createDatabasePool();
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const alreadyApplied = await pool.query<{ filename: string }>(
    'SELECT filename FROM public.schema_migrations WHERE filename = $1',
    [migration.replace('.down.sql', '.up.sql')],
  );

  if (migration.endsWith('.up.sql')) {
    if (alreadyApplied.rows.length > 0) {
      console.log(`[Database] Already applied ${migration}`);
    } else {
      await applyMigration(pool, migration);
      await pool.query('INSERT INTO public.schema_migrations (filename) VALUES ($1)', [migration]);
      console.log(`[Database] Applied ${migration}`);
    }
  } else {
    const upMigration = migration.replace('.down.sql', '.up.sql');
    if (alreadyApplied.rows.length === 0) {
      console.log(`[Database] Not applied; nothing to roll back for ${upMigration}`);
    } else {
      await applyMigration(pool, migration);
      await pool.query('DELETE FROM public.schema_migrations WHERE filename = $1', [upMigration]);
      console.log(`[Database] Rolled back ${upMigration}`);
    }
  }
} finally {
  await pool.end();
}
