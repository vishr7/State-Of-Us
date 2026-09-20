/**
 * Start / stop / inspect the local development Postgres.
 *
 *   npm run db:start     # start it (no-op if already running)
 *   npm run db:stop      # stop it cleanly
 *   npm run db:status    # is it up, and what's in it?
 *   npm run db:migrate   # apply any migrations added since the database was created (run after pulling)
 *   npm run db:seed      # load the migrations + both seeds into an EMPTY database
 *
 * Uses the portable PostgreSQL binaries and data directory in
 * %LOCALAPPDATA%\citypulse-pg (override with CITYPULSE_PG_DIR). It lives
 * outside the repo on purpose: this project sits inside OneDrive, and syncing a
 * live Postgres data directory can corrupt it. See "Local database" in the
 * README for the one-time setup.
 *
 * Matches the URL in .env.example:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const pgRoot = process.env.CITYPULSE_PG_DIR ?? join(process.env.LOCALAPPDATA ?? '', 'citypulse-pg');
const bin = (name) => join(pgRoot, 'pgsql', 'bin', `${name}.exe`);
const dataDir = join(pgRoot, 'data');
const sqlDir = join(repo, 'database', 'supabase');
const conn = ['-U', 'postgres', '-h', 'localhost', '-p', '5432', '-d', 'postgres'];
const env = { ...process.env, PGPASSWORD: 'postgres' };

if (!existsSync(bin('pg_ctl')) || !existsSync(dataDir)) {
  console.error(`No Postgres found at ${pgRoot}. Follow "Local database" in the README to set it up once.`);
  process.exit(1);
}

const running = () => spawnSync(bin('pg_ctl'), ['-D', dataDir, 'status'], { encoding: 'utf8' }).status === 0;
const psql = (args) => spawnSync(bin('psql'), [...conn, '-v', 'ON_ERROR_STOP=1', ...args], { env, encoding: 'utf8' });

const command = process.argv[2];

const migrationFiles = () => readdirSync(join(sqlDir, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
// Which migrations this local database has had applied. Local-dev bookkeeping only.
const TRACKING = 'create table if not exists public.local_migrations (name text primary key, applied_at timestamptz not null default now())';
const record = (name) => psql(['-q', '-c', `insert into public.local_migrations(name) values ('${name}') on conflict do nothing`]);

if (command === 'start') {
  if (running()) {
    console.log('Postgres is already running on localhost:5432');
  } else {
    // Start-Process gives Postgres its own hidden console. Launching pg_ctl
    // directly leaves the server attached to THIS console, and closing the
    // terminal (or a Ctrl+C) then kills it with STATUS_CONTROL_C_EXIT. Stdio is
    // ignored so pg_ctl's child doesn't hold this process's pipes open.
    const args = ['-D', `"${dataDir}"`, '-l', `"${join(pgRoot, 'server.log')}"`, '-o', '"-p 5432 -c listen_addresses=localhost"', '-w', 'start'];
    spawn(
      'powershell.exe',
      ['-NoProfile', '-Command', `Start-Process -WindowStyle Hidden -FilePath '${bin('pg_ctl')}' -ArgumentList '${args.join(' ').replace(/'/g, "''")}'`],
      { stdio: 'ignore' },
    ).unref();
    for (let i = 0; i < 40 && !running(); i++) await new Promise((r) => setTimeout(r, 500));
    console.log(running() ? 'Postgres started on localhost:5432' : `Postgres failed to start — see ${join(pgRoot, 'server.log')}`);
    process.exit(running() ? 0 : 1);
  }
} else if (command === 'stop') {
  const r = spawnSync(bin('pg_ctl'), ['-D', dataDir, '-m', 'fast', 'stop'], { encoding: 'utf8' });
  console.log(r.status === 0 ? 'Postgres stopped' : 'Postgres was not running');
} else if (command === 'status') {
  if (!running()) {
    console.log('Postgres is NOT running — start it with: npm run db:start');
    process.exit(1);
  }
  const r = psql(['-t', '-A', '-c', "select string_agg(name || ' (turn ' || current_turn || ')', ', ' order by name) from cities"]);
  console.log('Postgres is running. Cities:', r.status === 0 ? r.stdout.trim() || '(none — run npm run db:seed)' : `query failed: ${r.stderr.trim()}`);
} else if (command === 'migrate') {
  if (!running()) {
    console.error('Postgres is not running — start it with: npm run db:start');
    process.exit(1);
  }
  let r = psql(['-q', '-c', TRACKING]);
  const applied = new Set(
    r.status === 0
      ? psql(['-t', '-A', '-c', 'select name from public.local_migrations']).stdout.split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean)
      : [],
  );
  const pending = migrationFiles().filter((f) => !applied.has(f));
  if (r.status === 0 && applied.size === 0 && pending.length > 0) {
    console.error(`No migration history recorded for this database. If it was set up before db:migrate existed, record what it already has, e.g.:
  psql ... -c "insert into public.local_migrations(name) values ('<file>.sql')"
then re-run. (A fresh database should use npm run db:seed.)`);
    process.exit(1);
  }
  for (const f of pending) {
    if (r.status !== 0) break;
    console.log(`applying ${f}`);
    r = psql(['-q', '-f', join(sqlDir, 'migrations', f)]);
    if (r.status === 0) r = record(f);
  }
  if (r.status !== 0) {
    console.error(r.stderr.trim());
    process.exit(1);
  }
  console.log(pending.length ? 'Done.' : 'Already up to date.');
} else if (command === 'seed') {
  if (!running()) {
    console.error('Postgres is not running — start it with: npm run db:start');
    process.exit(1);
  }
  // The Supabase migrations grant to roles plain Postgres doesn't have.
  const roles = "do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;";
  const files = [
    ...migrationFiles().map((f) => join('migrations', f)),
    'seed.sql',
    'seed_pittsburgh.sql',
  ];
  let r = psql(['-q', '-c', roles]);
  for (const f of files) {
    if (r.status !== 0) break;
    console.log(`applying ${f}`);
    r = psql(['-q', '-f', join(sqlDir, f)]);
    if (r.status === 0 && f.startsWith('migrations')) {
      r = psql(['-q', '-c', TRACKING]);
      if (r.status === 0) r = record(f.slice('migrations'.length + 1));
    }
  }
  if (r.status !== 0) {
    console.error(r.stderr.trim());
    console.error('\nSeeding failed. On a database that already has the schema, migrations cannot be re-applied — recreate it first.');
    process.exit(1);
  }
  console.log('Done.');
} else {
  console.error('Usage: node scripts/local-pg.mjs <start|stop|status|migrate|seed>');
  process.exit(1);
}
