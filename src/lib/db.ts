/**
 * Direct Postgres connection for the simulation engine.
 *
 * Deliberately NOT supabase-js / PostgREST: resolving a turn writes residents,
 * neighborhoods, cities, and a snapshot in one atomic transaction, which
 * PostgREST cannot express across tables. `pg` gives a real BEGIN/COMMIT.
 * This connects with the same privileges as the Supabase `service_role` key
 * would (a direct Postgres role bypasses RLS entirely), which matches the
 * architecture rule: only the engine, running server-side, mutates canonical
 * state.
 */
import { Pool, type PoolClient, types } from 'pg';

// node-postgres returns `numeric`/`decimal` columns as STRINGS by default, to
// avoid silently losing precision. Every numeric column in this schema is
// documented (see src/types/database.ts) as a JS `number`, so we opt in to
// that here, once, globally. OID 1700 = numeric.
// (This is the opposite gotcha from PostgREST, which already serialises
// numeric as a JSON number — see supabase/README.md "Known MVP limitations".)
types.setTypeParser(1700, (value: string) => parseFloat(value));

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set. The simulation engine needs a direct Postgres ' +
          'connection string (see .env.example), not the Supabase PostgREST URL.'
      );
    }
    pool = new Pool({
      connectionString,
      // Hosted Supabase requires TLS; local Postgres does not speak it.
      ssl: connectionString.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

/**
 * Runs `fn` with a single client inside BEGIN/COMMIT. Any thrown error rolls
 * the transaction back before rethrowing, so a turn is never partially
 * resolved.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      // Swallow rollback failure — the original error is what matters.
    });
    throw err;
  } finally {
    client.release();
  }
}

/** Only for test teardown; not used by the app itself. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
