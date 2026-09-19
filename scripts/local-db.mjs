/**
 * Zero-install local Postgres for development.
 *
 *   npm run db:local            # start (creates + seeds the database on first run)
 *   npm run db:local -- --reset # wipe .local-db and start fresh
 *
 * Runs an embedded Postgres (PGlite) and serves it over the normal Postgres
 * wire protocol, so the app's `pg` pool connects exactly as it would to a real
 * server:
 *
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
 *
 * Data persists in ./.local-db (gitignored). On first run it applies every
 * migration in database/supabase/migrations, then seed.sql (Marrow Bay) and
 * seed_pittsburgh.sql (what the CityPulse UI plays). Leave it running in its
 * own terminal while `npm run dev` is up; Ctrl+C stops it cleanly.
 *
 * Development convenience only — point DATABASE_URL at a real Postgres or
 * Supabase project for anything shared or deployed.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, '.local-db');
const sqlDir = join(root, 'database', 'supabase');
const port = Number(process.env.LOCAL_DB_PORT ?? 5432);

if (process.argv.includes('--reset')) {
  rmSync(dataDir, { recursive: true, force: true });
  console.log('Removed .local-db');
}

const db = await PGlite.create(dataDir);

const { rows } = await db.query("select to_regclass('public.cities') as cities");
if (!rows[0].cities) {
  console.log('Empty database — applying migrations and seeds…');
  // Roles the Supabase migrations grant to; plain Postgres doesn't have them.
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;`);
  const migrations = readdirSync(join(sqlDir, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrations) {
    await db.exec(readFileSync(join(sqlDir, 'migrations', file), 'utf8'));
    console.log(`  migrated ${file}`);
  }
  for (const file of ['seed.sql', 'seed_pittsburgh.sql']) {
    if (!existsSync(join(sqlDir, file))) throw new Error(`Missing ${file}`);
    await db.exec(readFileSync(join(sqlDir, file), 'utf8'));
    console.log(`  seeded ${file}`);
  }
}

const cities = await db.query('select name, current_turn from cities order by name');
console.log('Cities:', cities.rows.map((c) => `${c.name} (turn ${c.current_turn})`).join(', '));

// Dashboard API routes use pooled connections and load in parallel. The
// socket server defaults to one client; its multiplexer queues their queries.
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 100 });
await server.start();
console.log(`\nLocal Postgres ready. DATABASE_URL=postgresql://postgres:postgres@localhost:${port}/postgres`);
console.log('Ctrl+C to stop.');

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await server.stop().catch(() => {});
  await db.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
