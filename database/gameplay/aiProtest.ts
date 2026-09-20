import { POWER_OUTAGE_POLICIES } from './powerOutage';
import { withTransaction } from '../lib/db';
import type { City, Policy } from '../types/database';
import { catalogChoice } from './catalogChoices';
import { policyFingerprint } from '../simulation/bindExecutableActions';

// Authored simulation event; never presented as a real Pittsburgh news report.
export const AI_PROTEST_POLICIES: Policy[] = [
  {
    id: 'ae000002-0000-4000-8000-000000000001', name: 'Fund a people-first AI policy',
    description: 'Spend $250,000 on privacy audits, human appeals and worker retraining before citywide AI rollout. Lower-income residents gain 6 happiness and 0.08 trust; other residents gain 2 happiness and 0.02 trust. No recurring cost.',
    category: 'services', upfront_cost: 250000, recurring_cost: 0,
    effects: { version: 1, city: { treasury: { op: 'add', value: -250000 } }, residents: [
      { where: { income_lt: 60000 }, set: { happiness: { op: 'add', value: 6 }, government_trust: { op: 'add', value: .08 } } },
      { where: { income_gte: 60000 }, set: { happiness: { op: 'add', value: 2 }, government_trust: { op: 'add', value: .02 } } },
    ] },
  },
  {
    id: 'ae000002-0000-4000-8000-000000000002', name: 'Reject the rollout and keep the money',
    description: 'Spend $0. Cancel the proposed citywide AI rollout and preserve $250,000 for other priorities. Residents under $60,000 gain 2 happiness from avoiding automated eligibility decisions; higher-income residents lose 3 happiness and 0.03 trust as planned service improvements stall.',
    category: 'services', upfront_cost: 0, recurring_cost: 0,
    effects: { version: 1, residents: [
      { where: { income_lt: 60000 }, set: { happiness: { op: 'add', value: 2 } } },
      { where: { income_gte: 60000 }, set: { happiness: { op: 'add', value: -3 }, government_trust: { op: 'add', value: -.03 } } },
    ] },
  },
];
export function isProtestPolicy(id: string) { return [...AI_PROTEST_POLICIES, ...POWER_OUTAGE_POLICIES].some(p => p.id === id); }

/** Install the authored Day 2 slate atomically, without changing any saved choice. */
export async function ensureAIProtest(cityId: string, turn: number) {
  if (turn !== 1 && turn !== 3) return;
  const event = turn === 1 ? 'day-2-ai-protest' : 'day-4-power-outage';
  const catalog = turn === 1 ? AI_PROTEST_POLICIES : POWER_OUTAGE_POLICIES;
  await withTransaction(async db => {
    const city = (await db.query<City>('select * from cities where id=$1 for update', [cityId])).rows[0];
    if (!city || city.current_turn !== turn) return;
    if ((await db.query('select id from decisions where city_id=$1 and turn=$2', [cityId, turn])).rows.length) return;
    const existing = (await db.query<{ status: string; generation_metadata: { event?: string } }>('select status,generation_metadata from game_days where city_id=$1 and turn=$2', [cityId, turn])).rows[0];
    if (existing?.status === 'ready' && existing.generation_metadata?.event === event) return;
    const policies: Policy[] = [];
    for (const p of catalog) {
      const saved = await db.query<Policy>(
        'insert into policies(id,name,description,category,upfront_cost,recurring_cost,effects) values($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict(id) do update set id=excluded.id returning *',
        [p.id,p.name,p.description,p.category,p.upfront_cost,p.recurring_cost,JSON.stringify(p.effects)]);
      policies.push(saved.rows[0]);
    }
    const choices = policies.map(catalogChoice);
    await db.query(`insert into game_days(city_id,turn,status,candidate_pool,selected_ids,policy_hashes,generation_metadata,completed_at)
      values($1,$5,'ready',$2::jsonb,$3::jsonb,$4::jsonb,$6::jsonb,now())
      on conflict(city_id,turn) do update set status='ready',candidate_pool=excluded.candidate_pool,
      selected_ids=excluded.selected_ids,policy_hashes=excluded.policy_hashes,generation_metadata=excluded.generation_metadata,error=null,completed_at=now()`,
      [cityId,JSON.stringify(choices),JSON.stringify(choices.map(c=>c.id)),JSON.stringify(Object.fromEntries(policies.map(p=>[p.id,policyFingerprint(p)]))),turn,JSON.stringify({ event })]);
  });
}
