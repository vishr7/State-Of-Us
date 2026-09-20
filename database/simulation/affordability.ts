/**
 * Can the city pay for a policy? The treasury may never go below $0, so a
 * policy whose effects would take cash negative must be refused BEFORE it is
 * queued as a decision. (The engine also floors treasury at 0 when effects are
 * applied — see FIELD_BOUNDS in applyPolicyEffects.ts — but flooring alone
 * would let a player pay for part of a policy and get all of it, so the check
 * happens up front.)
 *
 * PURE: no I/O. Imported by the API routes and by the browser UI, so both use
 * exactly the same rule.
 */
import type { PolicyEffects } from '../types/database';

export interface Affordability {
  affordable: boolean;
  /** Cash after the policy's own treasury effect, UNCLAMPED (negative when it can't be paid for). */
  projectedTreasury: number;
  /** How much more cash is needed; 0 when affordable. */
  shortfall: number;
}

/** Applies only `effects.city.treasury`, the single field that moves cash directly. */
export function projectTreasury(treasury: number, effects: PolicyEffects): number {
  const op = effects.city?.treasury;
  if (!op || typeof op.value !== 'number' || !Number.isFinite(op.value)) return treasury;
  switch (op.op) {
    case 'set': return op.value;
    case 'multiply': return treasury * op.value;
    case 'add': return treasury + op.value;
    default: return treasury;
  }
}

export function checkAffordability(treasury: number, effects: PolicyEffects): Affordability {
  const projectedTreasury = projectTreasury(treasury, effects);
  const shortfall = projectedTreasury < 0 ? -projectedTreasury : 0;
  return { affordable: shortfall === 0, projectedTreasury, shortfall };
}

const usd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

/** Player-facing explanation, e.g. `Not enough cash for "Expand Transit": $1,200,000 needed, $500,000 available.` */
export function insufficientFundsMessage(policyName: string, treasury: number, result: Affordability): string {
  const needed = treasury + result.shortfall;
  return `Not enough cash for "${policyName}": ${usd(needed)} needed, ${usd(Math.max(0, treasury))} available.`;
}
