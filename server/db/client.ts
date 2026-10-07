import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

export type DatabaseClient = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error('DATABASE_URL is required for database operations');
  }
  return value;
}

export function createDatabasePool(): Pool {
  return new Pool({
    connectionString: getDatabaseUrl(),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DATABASE_SSL === 'disable' ? false : undefined,
  });
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  client: DatabaseClient,
  text: string,
  values: unknown[] = [],
): Promise<{ rows: T[] }> {
  return client.query<T>(text, values);
}

export async function withTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function applyMigration(pool: Pool, migrationName: string): Promise<void> {
  const migrationPath = path.join(
    process.cwd(),
    'server',
    'db',
    'migrations',
    migrationName,
  );
  const sql = await readFile(migrationPath, 'utf8');
  await pool.query(sql);
}
