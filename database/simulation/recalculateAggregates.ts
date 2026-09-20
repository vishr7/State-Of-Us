/**
 * Recomputes the denormalised aggregate columns on `neighborhoods` and
 * `cities` from `residents` — the same derivation the seed uses (see
 * database/supabase/seed.sql steps 4-5 and database/supabase/README.md "Derived columns").
 * Kept in this one file so the two stay in sync by construction.
 *
 * PURE, like applyPolicyEffects.ts: no I/O, no randomness.
 */
import type { City, Neighborhood, Resident } from '../types/database';

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Mean monthly housing_cost of renting + subsidised households; 0 if none. */
function averageRent(residents: Resident[]): number {
  const paying = residents.filter(
    (r) => r.housing_status === 'renter' || r.housing_status === 'subsidized'
  );
  return round2(average(paying.map((r) => r.housing_cost)));
}

/**
 * Recomputes one neighborhood's derived fields from the residents that live
 * in it. `residents` may be the full city resident list — it's filtered by
 * `neighborhood_id` internally.
 */
export function recalculateNeighborhoodAggregates(
  neighborhood: Neighborhood,
  residents: Resident[]
): Neighborhood {
  const local = residents.filter((r) => r.neighborhood_id === neighborhood.id);

  return {
    ...neighborhood,
    // Households, not people: population is the sum of family_size, never
    // resident-row count. See database/supabase/README.md "A resident row is one household".
    population: local.reduce((sum, r) => sum + r.family_size, 0),
    average_income: round2(average(local.map((r) => r.income))),
    average_rent: averageRent(local),
    happiness: round2(average(local.map((r) => r.happiness))),
  };
}

/**
 * Recomputes a city's derived fields from every resident in the city
 * (across all of its neighborhoods). `treasury`, `revenue`, `expenses`, and
 * `debt` are NOT derived — they move only via explicit policy effects, so
 * they are left as-is here (treasury is only floored at 0).
 */
export function recalculateCityAggregates(city: City, residents: Resident[]): City {
  // Labour force excludes retired and student residents — matches the seed's
  // unemployment convention (database/supabase/README.md, occupation column doc).
  const laborForce = residents.filter((r) => r.occupation !== 'retired' && r.occupation !== 'student');
  const unemployed = laborForce.filter((r) => r.occupation === 'unemployed');

  const avgHappiness = average(residents.map((r) => r.happiness));
  const avgTrust = average(residents.map((r) => r.government_trust));

  return {
    ...city,
    // Not derived from residents, but never negative: also heals a city saved
    // before the floor existed on the next resolved turn.
    treasury: Math.max(0, city.treasury),
    population: residents.reduce((sum, r) => sum + r.family_size, 0),
    happiness: round2(avgHappiness),
    // Approval blends lived experience with institutional trust, same weights
    // as the seed: 0.55 * happiness + 45 * trust, clamped to [0, 100].
    approval: round2(clamp(0.55 * avgHappiness + 45 * avgTrust, 0, 100)),
    unemployment: laborForce.length > 0 ? round2((unemployed.length / laborForce.length) * 100) : 0,
    average_rent: averageRent(residents),
  };
}
