'use client';

import { useState } from 'react';
import { useCityPulseStore } from '@/lib/store';
import { useAgenda } from '../gameplay/DailyAgenda';

export default function ResetDemoButton() {
  const [resetting, setResetting] = useState(false);
  const blocked = useCityPulseStore(s => s.resolvingTurn || s.submittingPolicy
    || s.backend.status === 'connecting' || s.backend.status === 'idle');

  async function reset() {
    if (resetting || blocked) return;
    if (!window.confirm('Reset the demo to Day 1? This restores the starting money, residents, and city conditions, and clears all decisions and progress for this city.')) return;
    setResetting(true);
    const state = useCityPulseStore.getState();
    state.stopPlaying();
    useAgenda.getState().setOpen(false);
    try {
      if (state.backendLink) {
        const response = await fetch(`/api/city/${state.backendLink.cityId}/reset`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not reset the demo.');
        try { localStorage.removeItem(`week-recap-shown:${state.backendLink.cityId}`); } catch { /* Storage may be disabled. */ }
      }
      // Recreate every client store, timer, animation, agenda cache, and chart.
      // The Play screen then reconnects to the restored city.
      window.location.reload();
    } catch (error) {
      setResetting(false);
      useAgenda.getState().setOpen(true);
      state.showToast(error instanceof Error ? error.message : 'Could not reset the demo.', 'error');
    }
  }

  return <>
    <button type="button" onClick={reset} disabled={blocked || resetting}
      className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
      title="Restore Day 1 and the starting budget">
      {resetting ? 'Resetting…' : 'Reset demo'}
    </button>
    {resetting && <div className="fixed inset-0 z-[9999] grid place-items-center bg-slate-950/90 text-slate-100" role="status" aria-live="polite" aria-busy="true">
      Restoring your city for the next demo…
    </div>}
  </>;
}
