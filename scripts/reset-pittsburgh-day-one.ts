/** Explicit local game reset. Run with --confirm-reset; writes a recovery backup first. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { getPool } from '../database/lib/db';
import { fillDailyChoices } from '../database/gameplay/catalogChoices';
import { policyFingerprint } from '../database/simulation/bindExecutableActions';
import type { Policy } from '../database/types/database';
async function main() {
if (!process.argv.includes('--confirm-reset')) throw new Error('Pass --confirm-reset to reset Pittsburgh.');
const pool=getPool(); const db=await pool.connect();
const cityId='77777777-7777-4777-8777-000000000001';
try {
  await db.query('begin');
  await db.query('select id from cities where id=$1 for update',[cityId]);
  const backup: Record<string,unknown>={};
  for(const table of ['cities','neighborhoods','residents','policies','decisions','simulation_snapshots','game_days','reaction_runs','resident_reactions']) backup[table]=(await db.query(`select * from ${table}`)).rows;
  await mkdir('.local-db/backups',{recursive:true});
  const path=`.local-db/backups/before-day-one-${Date.now()}.json`;
  await writeFile(path,JSON.stringify(backup,null,2),{mode:0o600});
  await db.query('delete from resident_reactions where city_id=$1',[cityId]);
  const seed=(await readFile('database/supabase/seed_pittsburgh.sql','utf8')).replace(/^begin;\s*$/mi,'').replace(/^commit;\s*$/mi,'');
  await db.query(seed);
  const policies=(await db.query<Policy>("select * from policies where id::text like '99999999-9999-4999-8999-%' order by id")).rows;
  const choices=fillDailyChoices([],policies,0);
  if(choices.length!==5)throw new Error('Expected five playable policies.');
  const hashes=Object.fromEntries(policies.filter(p=>choices.some(c=>c.policyId===p.id)).map(p=>[p.id,policyFingerprint(p)]));
  await db.query("insert into game_days(city_id,turn,status,candidate_pool,selected_ids,policy_hashes,generation_metadata,completed_at) values($1,0,'ready',$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,now())",[cityId,JSON.stringify(choices),JSON.stringify(choices.map(c=>c.id)),JSON.stringify(hashes),JSON.stringify({source:'authored-catalog',reason:'Day-one starting agenda'})]);
  await db.query('commit');
  console.log('Reset to Day 1. Backup:',path); console.log('Playable choices:',choices.map(c=>c.title));
} catch(e) { await db.query('rollback'); throw e; }
finally { db.release(); await pool.end(); }

}
void main().catch(error => { console.error(error); process.exitCode=1; });
