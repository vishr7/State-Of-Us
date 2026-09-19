/**
 * Database writes for one turn resolution. One UPDATE per row — straightforward
 * and correct at the seed's scale (100 residents, 4 neighborhoods). Revisit
 * with a bulk `UPDATE ... FROM unnest(...)` if resident counts grow enough for
 * this to matter; not worth the complexity for the MVP.
 */
import type { PoolClient } from 'pg';
import type { City, Neighborhood, Resident, SimulationState } from '../types/database';

export async function persistResidents(client: PoolClient, residents: Resident[]): Promise<void> {
  for (const r of residents) {
    await client.query(
      `update residents set
         income = $2,
         occupation = $3,
         housing_status = $4,
         housing_cost = $5,
         commute_minutes = $6,
         family_size = $7,
         tax_sensitivity = $8,
         housing_sensitivity = $9,
         transit_sensitivity = $10,
         government_trust = $11,
         happiness = $12,
         archetype = $13
       where id = $1`,
      [
        r.id,
        r.income,
        r.occupation,
        r.housing_status,
        r.housing_cost,
        r.commute_minutes,
        r.family_size,
        r.tax_sensitivity,
        r.housing_sensitivity,
        r.transit_sensitivity,
        r.government_trust,
        r.happiness,
        r.archetype,
      ]
    );
  }
}

export async function persistNeighborhoods(client: PoolClient, neighborhoods: Neighborhood[]): Promise<void> {
  for (const n of neighborhoods) {
    await client.query(
      `update neighborhoods set
         population = $2,
         average_income = $3,
         average_rent = $4,
         property_value = $5,
         housing_supply = $6,
         jobs = $7,
         transit_access = $8,
         happiness = $9
       where id = $1`,
      [n.id, n.population, n.average_income, n.average_rent, n.property_value, n.housing_supply, n.jobs, n.transit_access, n.happiness]
    );
  }
}

/**
 * Also advances `current_turn`. `updated_at` is left alone — the
 * `cities_set_updated_at` trigger from the migration stamps it automatically.
 */
export async function persistCity(client: PoolClient, city: City): Promise<void> {
  await client.query(
    `update cities set
       population = $2,
       treasury = $3,
       revenue = $4,
       expenses = $5,
       debt = $6,
       happiness = $7,
       approval = $8,
       unemployment = $9,
       average_rent = $10,
       current_turn = $11
     where id = $1`,
    [
      city.id,
      city.population,
      city.treasury,
      city.revenue,
      city.expenses,
      city.debt,
      city.happiness,
      city.approval,
      city.unemployment,
      city.average_rent,
      city.current_turn,
    ]
  );
}

/**
 * Throws the raw `pg` error (code `23505`) on a duplicate (city_id, turn) —
 * resolveTurn.ts translates that into SnapshotAlreadyExistsError so callers
 * don't need to know the Postgres error code.
 */
export async function insertSnapshot(
  client: PoolClient,
  cityId: string,
  turn: number,
  state: SimulationState
): Promise<void> {
  await client.query('insert into simulation_snapshots (city_id, turn, state) values ($1, $2, $3::jsonb)', [
    cityId,
    turn,
    JSON.stringify(state),
  ]);
}
