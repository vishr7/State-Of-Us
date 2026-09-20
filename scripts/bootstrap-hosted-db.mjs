import { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';

// Explicit separate variable prevents accidentally resetting the local database.
const connectionString = process.env.HOSTED_DATABASE_URL;
if (!connectionString) throw new Error('Set HOSTED_DATABASE_URL to the new hosted database connection string.');
const address = new URL(connectionString);
if (['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)) throw new Error('Expected a hosted database.');
const pool = new Pool({ connectionString, connectionTimeoutMillis: 15000, max: 1 });
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(19092026)');
    const existing = await client.query("select tablename from pg_tables where schemaname='public'");
    if (existing.rows.length) throw new Error('Refusing to bootstrap a non-empty database. Existing data has been preserved.');
    for (const name of (await readdir('database/supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) {
      const sql = await readFile(`database/supabase/migrations/${name}`, 'utf8');
      await client.query(sql.replace(/^\s*(begin|commit);\s*$/gim, ''));
      console.log(`Applied ${name}`);
    }
    const seed = await readFile('database/supabase/seed_pittsburgh.sql', 'utf8');
    await client.query(seed.replace(/^\s*(begin|commit);\s*$/gim, ''));
    const result = await client.query("select name,current_turn from cities where name='Pittsburgh'");
    if (result.rows.length !== 1) throw new Error('Pittsburgh seed verification failed.');
    await client.query('COMMIT');
    console.log('Hosted database initialized with Pittsburgh at Day 1.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
} catch (error) {
  const message = error instanceof Error ? error.message : 'Database setup failed';
  console.error(message.split(connectionString).join('[REDACTED]').split(decodeURIComponent(address.password)).join(address.password ? '[REDACTED]' : ''));
  process.exitCode = 1;
} finally { await pool.end(); }
