import { readdir, readFile, writeFile } from 'node:fs/promises';
import { getPool, closePool } from '../database/lib/db';
import { persistExternalSignals } from '../database/simulation/persistExternalSignals';
import { externalSignalSchema } from '../lib/signals/decisions';
import { generateEventCandidates } from '../lib/signals/generate-event-candidates';
import { bindExecutableActions } from '../database/simulation/bindExecutableActions';
import type { City, Policy, SimulationState } from '../database/types/database';
async function main() {
 const pool=getPool();
 let inserted=0;
 const signals=[];
 for(const file of await readdir('data/signals/extracted')) {
  if(!file.endsWith('.json')) continue;
  const batch=JSON.parse(await readFile(`data/signals/extracted/${file}`,'utf8'));
  const valid=(batch.signals ?? []).map((s: unknown)=>externalSignalSchema.parse(s));
  inserted+=(await persistExternalSignals(pool,valid)).inserted;
  signals.push(...valid);
 }
 const city=(await pool.query<City>('select * from cities order by created_at limit 1')).rows[0];
 if(!city) throw new Error('No city available for verification.');
 const {created_at,updated_at,...context}=city;
 const fresh=signals.filter(s=>s.geography.name.toLowerCase()==='pittsburgh' && s.provenance.promptVersion==='external-signals-v3-gemini');
 if(!fresh.length) throw new Error('No new Pittsburgh evidence was extracted.');
 console.log(JSON.stringify({inserted,newPittsburghSignals:fresh.length}));
 const candidates=await generateEventCandidates({cityId:city.id,turn:city.current_turn,signals:fresh.filter(s => s.category === 'housing').slice(0,1),cityContext:context as SimulationState['city'],targetCount:10});
 const catalog=(await pool.query<Policy>('select * from policies')).rows;
 const bound=bindExecutableActions(candidates,catalog);
 await writeFile('data/signals/source-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),cityId:city.id,turn:city.current_turn,candidates:bound},null,2));
 console.log(JSON.stringify({generated:bound.length,playable:bound.filter(c=>c.executable).map(c=>({title:c.title,sources:c.sourceRefs.map(s=>s.url)})),gameAdvanced:false}));
 if(!bound.some(c=>c.executable)) throw new Error('No executable proposals generated.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(closePool);
