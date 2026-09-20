import { describe, expect, it } from 'vitest';
import { selectPolicyLock, unaffordableReason, type PolicyProgressState } from '../policyProgress';

const ready: PolicyProgressState = { submittingPolicy: false, resolvingTurn: false, pendingPolicy: null, consequenceQueue: [], backend: { status: 'connected' } };
describe('policy decision lock', () => {
  it('allows decisions once all effects have completed', () => expect(selectPolicyLock(ready)).toBeNull());
  it('blocks double-clicks before a decision response arrives', () => expect(selectPolicyLock({ ...ready, submittingPolicy: true })).toMatch(/Submitting/));
  it('blocks enactment during turn resolution', () => expect(selectPolicyLock({ ...ready, resolvingTurn: true })).toMatch(/Applying/));
  it('restores a lock from a pending database decision', () => expect(selectPolicyLock({ ...ready, pendingPolicy: { name: 'New housing', turn: 8 } })).toMatch(/New housing/));
  it('waits for the last delayed mock effect, not just the first', () => {
    const state = { ...ready, backend: { status: 'offline' as const }, consequenceQueue: [{ turnsRemaining: 1 }, { turnsRemaining: 3 }] };
    expect(selectPolicyLock(state)).toMatch(/3 turns/);
    expect(selectPolicyLock({ ...state, consequenceQueue: [{ turnsRemaining: 2 }] })).toMatch(/2 turns/);
    expect(selectPolicyLock({ ...state, consequenceQueue: [] })).toBeNull();
  });
  it('blocks decisions while loading canonical state', () => expect(selectPolicyLock({ ...ready, backend: { status: 'connecting' } })).toMatch(/Connecting/));
});

describe('unaffordableReason', () => {
  const policy = { name: 'Expand Transit', upfrontCost: 1_200_000 };
  it('blocks a policy that costs more than the cash on hand', () => expect(unaffordableReason(500_000, policy)).toMatch(/Not enough cash.*\$1,200,000 needed, \$500,000 available/));
  it('allows a policy the city can exactly afford', () => expect(unaffordableReason(1_200_000, policy)).toBeNull());
  it('never blocks free or revenue-raising policies, even at $0', () => {
    expect(unaffordableReason(0, { name: 'Free', upfrontCost: 0 })).toBeNull();
    expect(unaffordableReason(0, { name: 'Tax', upfrontCost: -50_000 })).toBeNull();
  });
});
