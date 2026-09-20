import { checkAffordability, insufficientFundsMessage } from '../database/simulation/affordability';

export interface PolicyProgressState {
  submittingPolicy: boolean;
  resolvingTurn: boolean;
  pendingPolicy: { name: string; turn: number } | null;
  consequenceQueue: { turnsRemaining: number }[];
  backend: { status: 'idle' | 'connecting' | 'connected' | 'offline' };
}

/** The lock follows actual engine completion, not speech playback or a timer. */
export const selectPolicyLock = (state: PolicyProgressState): string | null => {
  if (state.submittingPolicy) return 'Submitting your decision…';
  if (state.resolvingTurn) return 'Applying this turn’s effects…';
  if (state.backend.status === 'idle' || state.backend.status === 'connecting') return 'Connecting to your city…';
  if (state.pendingPolicy) return `${state.pendingPolicy.name} is taking effect. Advance the turn to continue.`;
  const remaining = Math.max(0, ...state.consequenceQueue.map(effect => effect.turnsRemaining));
  return remaining > 0 ? `Policy effects in progress · ${remaining} turn${remaining === 1 ? '' : 's'} remaining` : null;
};

/**
 * Why a policy can't be enacted for lack of cash, or null if the city can pay.
 * The treasury may never go below $0. The server enforces the same rule
 * (affordability.ts) — this is what lets the UI say so before the click.
 */
export const unaffordableReason = (treasury: number, policy: { name: string; upfrontCost: number }): string | null => {
  if (policy.upfrontCost <= 0) return null; // free, or brings in revenue
  const result = checkAffordability(treasury, { version: 1, city: { treasury: { op: 'add', value: -policy.upfrontCost } } });
  return result.affordable ? null : insufficientFundsMessage(policy.name, treasury, result);
};
