import { applyPolicyEffects, type PolicyEffectInput } from '../../database/simulation/applyPolicyEffects';
import { recalculateCityAggregates, recalculateNeighborhoodAggregates } from '../../database/simulation/recalculateAggregates';
import type { City, Policy } from '../../database/types/database';
import type { Metrics } from './contracts';
export function metrics(city: Pick<City, 'treasury' | 'happiness' | 'approval' | 'average_rent' | 'revenue' | 'expenses'>): Metrics {
  return { treasury: city.treasury, happiness: city.happiness, approval: city.approval, averageRent: city.average_rent, revenue: city.revenue, expenses: city.expenses };
}
/** Exactly the live engine's effect interpreter and aggregate formulas; no writes. */
export function previewPolicy(base: Omit<PolicyEffectInput, 'effects'>, policy: Policy) {
  const result = applyPolicyEffects({ ...structuredClone(base), effects: policy.effects });
  const neighborhoods = result.neighborhoods.map(n => recalculateNeighborhoodAggregates(n, result.residents));
  return {
    policyId: policy.id, name: policy.name,
    metrics: metrics(recalculateCityAggregates(result.city, result.residents)),
    neighborhoods: neighborhoods.map(n => ({ name: n.name, before: base.neighborhoods.find(b => b.id === n.id)!.happiness, after: n.happiness })),
  };
}
