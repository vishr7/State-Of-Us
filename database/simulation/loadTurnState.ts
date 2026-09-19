/**
 * Database reads for one turn resolution. Kept separate from the pure
 * simulation logic (applyPolicyEffects.ts, recalculateAggregates.ts) so those
 * stay easy to unit test without a database.
 */
import type { PoolClient } from 'pg';
import type { City, Neighborhood, Resident, Policy, Decision } from '../types/database';
import { CityNotFoundError, PolicyNotFoundError } from './errors';

export interface TurnState {
  city: City;
  neighborhoods: Neighborhood[];
  residents: Resident[];
  /** Decisions for `city.current_turn`, in a fixed deterministic order. */
  decisions: Decision[];
  /** decision.id -> the policy it references (every decision is guaranteed a match). */
  policyByDecisionId: Map<string, Policy>;
}

/**
 * Loads everything `resolveTurn` needs for `city.current_turn`: the city, its
 * neighborhoods, their residents, and the decisions (+ referenced policies)
 * queued for that turn.
 */
export async function loadTurnState(client: PoolClient, cityId: string): Promise<TurnState> {
  const cityResult = await client.query<City>('select * from cities where id = $1 for update', [cityId]);
  const city = cityResult.rows[0];
  if (!city) {
    throw new CityNotFoundError(`City ${cityId} does not exist`);
  }

  const neighborhoodsResult = await client.query<Neighborhood>(
    'select * from neighborhoods where city_id = $1 order by name',
    [cityId]
  );
  const neighborhoods = neighborhoodsResult.rows;
  const neighborhoodIds = neighborhoods.map((n) => n.id);

  const residents = neighborhoodIds.length
    ? (
        await client.query<Resident>(
          'select * from residents where neighborhood_id = any($1::uuid[]) order by id',
          [neighborhoodIds]
        )
      ).rows
    : [];

  // Deterministic order across multiple decisions in the same turn: by
  // creation time, then by id as a stable tiebreak. resolveTurn applies
  // policies in this exact order.
  const decisionsResult = await client.query<Decision>(
    'select * from decisions where city_id = $1 and turn = $2 order by created_at, id',
    [cityId, city.current_turn]
  );
  const decisions = decisionsResult.rows;

  const policyByDecisionId = new Map<string, Policy>();
  if (decisions.length > 0) {
    const policyIds = [...new Set(decisions.map((d) => d.policy_id))];
    const policiesResult = await client.query<Policy>('select * from policies where id = any($1::uuid[])', [
      policyIds,
    ]);
    const policyById = new Map(policiesResult.rows.map((p) => [p.id, p]));

    for (const decision of decisions) {
      const policy = policyById.get(decision.policy_id);
      if (!policy) {
        throw new PolicyNotFoundError(
          `Decision ${decision.id} (turn ${decision.turn}) references missing policy ${decision.policy_id}`
        );
      }
      policyByDecisionId.set(decision.id, policy);
    }
  }

  return { city, neighborhoods, residents, decisions, policyByDecisionId };
}
