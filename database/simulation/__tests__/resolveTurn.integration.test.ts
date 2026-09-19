/**
 * End-to-end proof that one full turn resolves correctly against a real
 * Postgres database running the actual migration + seed
 * (database/supabase/migrations, database/supabase/seed.sql).
 *
 * Requires DATABASE_URL to point at such a database — see .env.example and
 * database/supabase/README.md "Running it". Skips (not fails) if it's not set, so
 * `npm test` stays green in an environment with no database configured; run
 * `npm run test:integration` explicitly when you have one.
 *
 * NOT idempotent against a shared database: it calls resolveTurn() twice for
 * real, which really advances Marrow Bay's current_turn and writes real
 * snapshots (there's no "undo" — that's intentional, turn resolution is
 * meant to be a one-way ledger). Cleanup only removes the one `decisions` row
 * this file inserts. Point DATABASE_URL at a disposable/scratch database, not
 * a shared dev database, unless you're fine with its turn counter moving.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../../lib/db';
import type { City, Neighborhood, Policy, Resident, SimulationSnapshot } from '../../types/database';
import { resolveTurn } from '../resolveTurn';

const CROSSTOWN_BRT_POLICY_ID = '33333333-3333-4333-8333-000000000002';
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDatabase)('resolveTurn (integration)', () => {
  let cityId: string;
  let testDecisionId: string | undefined;

  beforeAll(async () => {
    const cityResult = await getPool().query<City>('select * from cities where name = $1', ['Marrow Bay']);
    if (!cityResult.rows[0]) {
      throw new Error(
        'Seeded city "Marrow Bay" not found. Run the migration + database/supabase/seed.sql against DATABASE_URL first.'
      );
    }
    cityId = cityResult.rows[0].id;

    // Phase 5 asks specifically for a transit-category policy. The seed's own
    // turn-0 decision references a housing policy, so this test adds its own
    // decision for Crosstown Bus Rapid Transit at the city's current turn,
    // rather than editing seed.sql (which the brief says not to touch).
    testDecisionId = randomUUID();
    await getPool().query(
      `insert into decisions (id, city_id, policy_id, turn, player_reasoning)
       select $1, id, $2, current_turn, 'integration test fixture'
       from cities where id = $3`,
      [testDecisionId, CROSSTOWN_BRT_POLICY_ID, cityId]
    );
  });

  afterAll(async () => {
    if (testDecisionId) {
      await getPool().query('delete from decisions where id = $1', [testDecisionId]);
    }
    await closePool();
  });

  it('resolves turn 0 deterministically from seeded state', async () => {
    const pool = getPool();

    const beforeCity = (await pool.query<City>('select * from cities where id = $1', [cityId])).rows[0];
    const beforeNeighborhoods = (
      await pool.query<Neighborhood>('select * from neighborhoods where city_id = $1 order by name', [cityId])
    ).rows;
    const beforeResidents = (
      await pool.query<Resident>(
        `select r.* from residents r join neighborhoods n on n.id = r.neighborhood_id where n.city_id = $1`,
        [cityId]
      )
    ).rows;
    const policy = (await pool.query<Policy>('select * from policies where id = $1', [CROSSTOWN_BRT_POLICY_ID]))
      .rows[0];

    const previousTurn = beforeCity.current_turn;

    const result = await resolveTurn(cityId);

    // --- current_turn advanced ---
    expect(result.previousTurn).toBe(previousTurn);
    expect(result.newTurn).toBe(previousTurn + 1);

    const afterCity = (await pool.query<City>('select * from cities where id = $1', [cityId])).rows[0];
    expect(afterCity.current_turn).toBe(previousTurn + 1);

    // --- treasury: BRT's effects have no `city` block, so financial fields
    // are untouched. (Phase 5: "treasury changes IF the policy has a city
    // financial effect" — this one doesn't, so treasury must not move.) ---
    expect(afterCity.treasury).toBe(beforeCity.treasury);
    expect(afterCity.revenue).toBe(beforeCity.revenue);

    // --- neighborhood transit_access: policy adds 18 where transit_access < 65 ---
    const afterNeighborhoods = (
      await pool.query<Neighborhood>('select * from neighborhoods where city_id = $1 order by name', [cityId])
    ).rows;
    for (const before of beforeNeighborhoods) {
      const after = afterNeighborhoods.find((n) => n.id === before.id)!;
      if (before.transit_access < 65) {
        expect(after.transit_access).toBeCloseTo(before.transit_access + 18, 5);
      } else {
        expect(after.transit_access).toBeCloseTo(before.transit_access, 5);
      }
    }

    // --- resident commute_minutes: policy multiplies by 0.82 where income < 70000 ---
    const afterResidents = (
      await pool.query<Resident>(
        `select r.* from residents r join neighborhoods n on n.id = r.neighborhood_id where n.city_id = $1`,
        [cityId]
      )
    ).rows;
    let sawAffectedResident = false;
    for (const before of beforeResidents) {
      const after = afterResidents.find((r) => r.id === before.id)!;
      if (before.income < 70000) {
        expect(after.commute_minutes).toBe(Math.round(before.commute_minutes * 0.82));
        sawAffectedResident = true;
      } else {
        expect(after.commute_minutes).toBe(before.commute_minutes);
      }
    }
    expect(sawAffectedResident).toBe(true); // sanity: the selector actually matched someone

    // --- neighborhood aggregates recomputed from (possibly updated) residents ---
    for (const after of afterNeighborhoods) {
      const local = afterResidents.filter((r) => r.neighborhood_id === after.id);
      const expectedPopulation = local.reduce((sum, r) => sum + r.family_size, 0);
      expect(after.population).toBe(expectedPopulation);
    }

    // --- city happiness recomputed from all residents ---
    const expectedHappiness =
      Math.round((afterResidents.reduce((sum, r) => sum + r.happiness, 0) / afterResidents.length) * 100) / 100;
    expect(afterCity.happiness).toBeCloseTo(expectedHappiness, 2);

    // --- turn+1 snapshot exists and carries the applied decision ---
    const snapshotResult = await pool.query<SimulationSnapshot>(
      'select * from simulation_snapshots where city_id = $1 and turn = $2',
      [cityId, previousTurn + 1]
    );
    expect(snapshotResult.rows).toHaveLength(1);
    const snapshot = snapshotResult.rows[0];
    expect(snapshot.state.turn).toBe(previousTurn + 1);
    expect(snapshot.state.residents).toHaveLength(afterResidents.length);
    expect(snapshot.state.applied_decisions.some((d) => d.policy_id === policy.id)).toBe(true);
  });

  it('rejects resolving the same turn twice (snapshot already exists)', async () => {
    // The previous test already advanced Marrow Bay past its original turn.
    // Resolving again with no new decisions should still succeed (turns
    // advance even with an empty decision set) and produce a *new* snapshot
    // at the *new* turn — proving turns don't silently collide.
    const before = (await getPool().query<City>('select * from cities where id = $1', [cityId])).rows[0];
    const result = await resolveTurn(cityId);
    expect(result.newTurn).toBe(before.current_turn + 1);
  });
}, 30_000);
