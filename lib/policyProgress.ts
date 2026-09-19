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
