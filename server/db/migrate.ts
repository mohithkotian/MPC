import fs from 'node:fs';
import path from 'node:path';
import { createDatabasePool, applyMigration } from './client';

const arg = process.argv[2];
const migrationsDir = path.join(process.cwd(), 'server', 'db', 'migrations');

const pool = createDatabasePool();
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  if (arg) {
    if (!/^[0-9]+_[a-z0-9_-]+\.(up|down)\.sql$/.test(arg)) {
      throw new Error(`Invalid migration filename: ${arg}`);
    }
    const alreadyApplied = await pool.query<{ filename: string }>(
      'SELECT filename FROM public.schema_migrations WHERE filename = $1',
      [arg.replace('.down.sql', '.up.sql')],
    );

    if (arg.endsWith('.up.sql')) {
      if (alreadyApplied.rows.length > 0) {
        console.log(`[Database] Already applied ${arg}`);
      } else {
        await applyMigration(pool, arg);
        await pool.query('INSERT INTO public.schema_migrations (filename) VALUES ($1)', [arg]);
        console.log(`[Database] Applied ${arg}`);
      }
    } else {
      const upMigration = arg.replace('.down.sql', '.up.sql');
      if (alreadyApplied.rows.length === 0) {
        console.log(`[Database] Not applied; nothing to roll back for ${upMigration}`);
      } else {
        await applyMigration(pool, arg);
        await pool.query('DELETE FROM public.schema_migrations WHERE filename = $1', [upMigration]);
        console.log(`[Database] Rolled back ${upMigration}`);
      }
    }
  } else {
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.up.sql'))
      .sort();

    for (const migration of files) {
      const alreadyApplied = await pool.query<{ filename: string }>(
        'SELECT filename FROM public.schema_migrations WHERE filename = $1',
        [migration],
      );
      if (alreadyApplied.rows.length > 0) {
        console.log(`[Database] Already applied ${migration}`);
      } else {
        await applyMigration(pool, migration);
        await pool.query('INSERT INTO public.schema_migrations (filename) VALUES ($1)', [migration]);
        console.log(`[Database] Applied ${migration}`);
      }
    }
  }
} finally {
  await pool.end();
}
