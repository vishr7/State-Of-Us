/**
 * Orchestrates one full turn resolution:
 *
 *   snapshot N
 *     -> apply decisions recorded at turn N (policy effects, in memory)
 *     -> recompute neighborhood + city aggregates from residents
 *     -> persist residents, neighborhoods, city
 *     -> write snapshot N+1 (the resulting canonical state)
 *     -> set cities.current_turn = N+1
 *
 * All of it runs inside one database transaction (database/lib/db.ts
 * withTransaction): if any step throws, everything rolls back and the turn
 * is not partially resolved. This is the only file in database/simulation that
 * talks to the database directly — applyPolicyEffects.ts and
 * recalculateAggregates.ts stay pure and DB-free.
 */
import { withTransaction } from '../lib/db';
import type { AppliedDecision, City, SimulationState } from '../types/database';
import { applyPolicyEffects } from './applyPolicyEffects';
import { SnapshotAlreadyExistsError } from './errors';
import { loadTurnState } from './loadTurnState';
import { insertSnapshot, persistCity, persistNeighborhoods, persistResidents } from './persistTurnState';
import { recalculateCityAggregates, recalculateNeighborhoodAggregates } from './recalculateAggregates';

export interface ResolveTurnResult {
  city: City;
  previousTurn: number;
  newTurn: number;
  appliedDecisions: AppliedDecision[];
}

/** Postgres error code for a unique-constraint violation. */
const POSTGRES_UNIQUE_VIOLATION = '23505';

export async function resolveTurn(cityId: string): Promise<ResolveTurnResult> {
  return withTransaction(async (client) => {
    const {
      city: initialCity,
      neighborhoods: initialNeighborhoods,
      residents: initialResidents,
      decisions,
      policyByDecisionId,
    } = await loadTurnState(client, cityId);

    const previousTurn = initialCity.current_turn;

    let city = initialCity;
    let neighborhoods = initialNeighborhoods;
    let residents = initialResidents;
    const appliedDecisions: AppliedDecision[] = [];

    // Deterministic across multiple decisions in the same turn: loadTurnState
    // already ordered `decisions` by (created_at, id), and effects apply in
    // that fixed order. If there are no decisions this turn, the loop simply
    // doesn't run and the turn still advances on the (re-derived, unchanged)
    // current state.
    for (const decision of decisions) {
      const policy = policyByDecisionId.get(decision.id);
      if (!policy) {
        // loadTurnState guarantees every decision has a matching policy;
        // this branch only exists to satisfy the type checker.
        continue;
      }
      const result = applyPolicyEffects({ city, neighborhoods, residents, effects: policy.effects });
      city = result.city;
      neighborhoods = result.neighborhoods;
      residents = result.residents;
      appliedDecisions.push({ decision_id: decision.id, policy_id: policy.id, policy_name: policy.name });
    }

    neighborhoods = neighborhoods.map((n) => recalculateNeighborhoodAggregates(n, residents));
    city = recalculateCityAggregates(city, residents);

    const newTurn = previousTurn + 1;
    city = { ...city, current_turn: newTurn };

    await persistResidents(client, residents);
    await persistNeighborhoods(client, neighborhoods);
    await persistCity(client, city);

    const state: SimulationState = {
      version: 1,
      turn: newTurn,
      city: omitTimestamps(city),
      neighborhoods,
      residents,
      applied_decisions: appliedDecisions,
    };

    try {
      await insertSnapshot(client, cityId, newTurn, state);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new SnapshotAlreadyExistsError(
          `A simulation snapshot for city ${cityId} turn ${newTurn} already exists`
        );
      }
      throw err;
    }

    return { city, previousTurn, newTurn, appliedDecisions };
  });
}

function omitTimestamps(city: City): SimulationState['city'] {
  const { created_at, updated_at, ...rest } = city;
  return rest;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION;
}
