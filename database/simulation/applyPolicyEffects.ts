/**
 * Deterministic interpreter for `policies.effects` (the `PolicyEffects`
 * contract in database/types/database.ts).
 *
 * PURE: takes and returns plain in-memory data. Never touches the database,
 * never reads the clock, never calls an LLM. Given the same inputs it always
 * produces the same outputs — that's what makes a turn resolution replayable.
 */
import type {
  City,
  Neighborhood,
  Resident,
  PolicyEffects,
  EffectOp,
  CityEffectTarget,
  NeighborhoodEffectTarget,
  ResidentEffectTarget,
  NeighborhoodSelector,
  ResidentSelector,
} from '../types/database';
import { MalformedPolicyEffectsError, UnsupportedEffectsVersionError } from './errors';

export interface PolicyEffectInput {
  city: City;
  neighborhoods: Neighborhood[];
  residents: Resident[];
  effects: PolicyEffects;
}

export interface PolicyEffectResult {
  city: City;
  neighborhoods: Neighborhood[];
  residents: Resident[];
}

// Runtime mirrors of the *EffectTarget unions in database/types/database.ts. These
// exist only as compile-time types there (erased at runtime), but `effects`
// arrives from the database as untyped JSONB, so the same whitelist has to be
// enforced again at runtime — otherwise a malformed or hand-edited policy row
// could set a DERIVED field (e.g. neighborhoods.population,
// cities.population) directly, which the architecture rule forbids: derived
// aggregates are owned by recalculateAggregates.ts, not by policy effects.
// Keep these three lists in sync with database.ts by hand.
const CITY_EFFECT_TARGETS = new Set<CityEffectTarget>([
  'revenue',
  'expenses',
  'debt',
  'treasury',
  'happiness',
  'approval',
  'unemployment',
]);

const NEIGHBORHOOD_EFFECT_TARGETS = new Set<NeighborhoodEffectTarget>([
  'property_value',
  'housing_supply',
  'jobs',
  'transit_access',
  'happiness',
]);

const RESIDENT_EFFECT_TARGETS = new Set<ResidentEffectTarget>([
  'income',
  'housing_cost',
  'commute_minutes',
  'government_trust',
  'happiness',
]);

// Fields whose underlying Postgres column is integer/smallint, not numeric.
// node-pg binds a numeric parameter using the target column's type input
// function, and int2/int4's input parser rejects fractional text outright
// ("invalid input syntax for type smallint") rather than rounding — unlike an
// explicit SQL CAST, which does round. A `multiply`/`add` op can easily
// produce a fraction (e.g. 38 * 0.82 = 31.16), so these targets are rounded
// here, in the pure function, so the result is still exactly what gets
// persisted (and what a replay recomputes).
const NEIGHBORHOOD_INTEGER_FIELDS = new Set<string>(['housing_supply', 'jobs']);
const RESIDENT_INTEGER_FIELDS = new Set<string>(['commute_minutes']);

/**
 * Apply one policy's `effects` to in-memory copies of city, neighborhoods,
 * and residents.
 *
 * Op ordering: for a given target field, `set` is applied before `multiply`,
 * which is applied before `add` — this is the ordering already documented on
 * `EffectOp`/`PolicyEffects` in database.ts, so that a bundle of effects is
 * order-independent. Today the contract only ever gives one op per field
 * (`Partial<Record<Target, EffectOp>>`), so this ordering has no visible
 * effect yet; it's implemented so the function stays correct if a future
 * contract version allows a field to carry more than one op.
 */
export function applyPolicyEffects(input: PolicyEffectInput): PolicyEffectResult {
  const { effects } = input;

  if (effects.version !== 1) {
    throw new UnsupportedEffectsVersionError(
      `Unsupported PolicyEffects version: ${JSON.stringify((effects as { version?: unknown }).version)}`
    );
  }

  let city: City = { ...input.city };
  let neighborhoods: Neighborhood[] = input.neighborhoods.map((n) => ({ ...n }));
  let residents: Resident[] = input.residents.map((r) => ({ ...r }));

  if (effects.city) {
    city = applyFieldOps(city, effects.city, CITY_EFFECT_TARGETS, undefined, 'policy.effects.city');
  }

  if (effects.neighborhoods) {
    effects.neighborhoods.forEach((effect, index) => {
      if (!effect.set || typeof effect.set !== 'object') {
        throw new MalformedPolicyEffectsError(
          `policy.effects.neighborhoods[${index}] is missing a "set" object`
        );
      }
      neighborhoods = neighborhoods.map((neighborhood) =>
        matchesNeighborhood(neighborhood, effect.where)
          ? applyFieldOps(
              neighborhood,
              effect.set,
              NEIGHBORHOOD_EFFECT_TARGETS,
              NEIGHBORHOOD_INTEGER_FIELDS,
              `policy.effects.neighborhoods[${index}].set`
            )
          : neighborhood
      );
    });
  }

  if (effects.residents) {
    // Selectors may reference `neighborhood_names`; residents only carry
    // neighborhood_id, so build the lookup once per effect from the (possibly
    // already-mutated-by-this-policy) neighborhoods list.
    effects.residents.forEach((effect, index) => {
      if (!effect.set || typeof effect.set !== 'object') {
        throw new MalformedPolicyEffectsError(`policy.effects.residents[${index}] is missing a "set" object`);
      }
      const neighborhoodNameById = new Map(neighborhoods.map((n) => [n.id, n.name]));
      residents = residents.map((resident) =>
        matchesResident(resident, effect.where, neighborhoodNameById.get(resident.neighborhood_id))
          ? applyFieldOps(
              resident,
              effect.set,
              RESIDENT_EFFECT_TARGETS,
              RESIDENT_INTEGER_FIELDS,
              `policy.effects.residents[${index}].set`
            )
          : resident
      );
    });
  }

  return { city, neighborhoods, residents };
}

/**
 * Applies a `{ field: EffectOp }` map to a shallow-copied entity, in the
 * fixed set -> multiply -> add order, validating each op against `allowed`
 * (the field whitelist) as it goes.
 */
function applyFieldOps<T extends object>(
  entity: T,
  ops: Partial<Record<string, EffectOp>>,
  allowed: ReadonlySet<string>,
  integerFields: ReadonlySet<string> | undefined,
  context: string
): T {
  const next = { ...entity } as Record<string, unknown>;
  const order: Array<EffectOp['op']> = ['set', 'multiply', 'add'];

  for (const opType of order) {
    for (const [field, op] of Object.entries(ops)) {
      if (!op || op.op !== opType) continue;

      if (!allowed.has(field)) {
        throw new MalformedPolicyEffectsError(
          `${context} targets "${field}", which is not a permitted effect target ` +
            `(derived/aggregate fields cannot be set directly by a policy)`
        );
      }

      const current = next[field];
      if (typeof current !== 'number') {
        throw new MalformedPolicyEffectsError(
          `${context}.${field} is not a numeric field on the target entity (got ${typeof current})`
        );
      }

      if (typeof op.value !== 'number' || !Number.isFinite(op.value)) {
        throw new MalformedPolicyEffectsError(`${context}.${field} has a non-finite "value"`);
      }

      let updated: number;
      switch (op.op) {
        case 'set':
          updated = op.value;
          break;
        case 'multiply':
          updated = current * op.value;
          break;
        case 'add':
          updated = current + op.value;
          break;
        default:
          throw new MalformedPolicyEffectsError(
            `${context}.${field} has an unsupported op "${String((op as EffectOp).op)}"`
          );
      }

      if (integerFields?.has(field)) {
        updated = Math.round(updated);
      }

      next[field] = updated;
    }
  }

  return next as T;
}

/** All predicates AND together; an omitted/empty `where` matches everything. */
function matchesNeighborhood(neighborhood: Neighborhood, where?: NeighborhoodSelector): boolean {
  if (!where) return true;
  if (where.names && !where.names.includes(neighborhood.name)) return false;
  if (where.transit_access_lt !== undefined && !(neighborhood.transit_access < where.transit_access_lt)) {
    return false;
  }
  if (where.transit_access_gte !== undefined && !(neighborhood.transit_access >= where.transit_access_gte)) {
    return false;
  }
  if (where.average_income_lt !== undefined && !(neighborhood.average_income < where.average_income_lt)) {
    return false;
  }
  if (where.average_income_gte !== undefined && !(neighborhood.average_income >= where.average_income_gte)) {
    return false;
  }
  return true;
}

/** All predicates AND together; an omitted/empty `where` matches everything. */
function matchesResident(
  resident: Resident,
  where: ResidentSelector | undefined,
  neighborhoodName: string | undefined
): boolean {
  if (!where) return true;
  if (where.archetypes && !where.archetypes.includes(resident.archetype)) return false;
  if (where.housing_statuses && !where.housing_statuses.includes(resident.housing_status)) return false;
  if (where.neighborhood_names) {
    if (!neighborhoodName || !where.neighborhood_names.includes(neighborhoodName)) return false;
  }
  if (where.income_lt !== undefined && !(resident.income < where.income_lt)) return false;
  if (where.income_gte !== undefined && !(resident.income >= where.income_gte)) return false;
  if (where.age_lt !== undefined && !(resident.age < where.age_lt)) return false;
  if (where.age_gte !== undefined && !(resident.age >= where.age_gte)) return false;
  return true;
}
