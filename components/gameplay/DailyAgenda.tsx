'use client';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useCityPulseStore } from '@/lib/store';
import type { GameDayResponse, GameDayOutcome, GameDayDecision } from '@/database/gameplay/contracts';
import type { GeneratedEventCandidate } from '@/lib/signals/generated-events';
import type { Policy } from '@/database/types/database';
import { SpeakText } from '../ui/InsightView';

export const useAgenda = create<{ open: boolean; setOpen: (open: boolean) => void }>(set => ({ open: true, setOpen: open => set({ open }) }));
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Could not load the daily agenda.');
  return data;
}
export default function DailyAgenda() {
  const { open, setOpen } = useAgenda();
  const cityId = useCityPulseStore(s => s.backendLink?.cityId);
  const turn = useCityPulseStore(s => s.city.turn - 1);
  const resolving = useCityPulseStore(s => s.resolvingTurn);
  const pending = useCityPulseStore(s => s.pendingPolicy);
  const [day, setDay] = useState<GameDayResponse | null>(null);
  const [choice, setChoice] = useState<GameDayDecision | null>(null);
  const [outcome, setOutcome] = useState<GameDayOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Policy[]>([]);
  useEffect(() => { api<Policy[]>('/api/policies').then(setCatalog).catch(() => {}); }, []);
  useEffect(() => { if (cityId && turn === 0) setOpen(true); }, [cityId, turn, setOpen]);
  useEffect(() => {
    if (!open || !cityId) return;
    useCityPulseStore.getState().stopPlaying();
    let cancelled = false;
    setDay(null); setChoice(null); setError(''); setBusy(true);
    Promise.all([
      api<GameDayResponse>(`/api/city/${cityId}/game-day?turn=${turn}`).catch(error => { if (String(error.message).includes('not found') || String(error.message).includes('No game day')) return null; throw error; }),
      api<GameDayDecision[]>(`/api/city/${cityId}/decisions`),
    ]).then(([saved, decisions]) => { if (!cancelled) { setDay(saved); setChoice(decisions.find(d => d.turn === turn) ?? null); const latest = decisions.filter(d => d.candidate_id && d.turn < turn).at(-1); if (latest) void api<GameDayOutcome>(`/api/city/${cityId}/game-day/outcome?turn=${latest.turn}`).then(value => { if (!cancelled) setOutcome(value); }).catch(() => {}); } })
      .catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [open, cityId, turn]);
  const prepare = async () => {
    const retry = /failed/i.test(error);
    setBusy(true); setError('');
    try { setDay(await api<GameDayResponse>(`/api/city/${cityId}/game-day`, { turn, retry })); }
    catch(e) { setError(e instanceof Error ? e.message : 'Preparation failed.'); }
    finally { setBusy(false); }
  };
  const choose = async (candidate: GeneratedEventCandidate) => {
    setBusy(true); setError(''); useCityPulseStore.setState({ submittingPolicy: true });
    try {
      const saved = await api<GameDayDecision>(`/api/city/${cityId}/decisions`, { candidate_id: candidate.id, turn, player_reasoning: reason.trim() || undefined });
      setChoice(saved);
      useCityPulseStore.setState({ pendingPolicy: { name: candidate.title, turn: turn + 1 } });
      setExpanded(null);
      void useCityPulseStore.getState().requestInsights({
        mode: 'decision', policyIds: [candidate.policyId!],
        event: `The player selected the simulation proposal "${candidate.title}": ${candidate.proposedAction ?? candidate.description}. Explain this decision and residents' likely feelings. Its effects have not been applied yet.`,
      }, true).then(result => {
        if (!result && useCityPulseStore.getState().city.turn === turn + 1) {
          useCityPulseStore.getState().announce(`${candidate.title} is selected. We’ll see the city’s response when you end the day.`, 'info');
        }
      });
    } catch(e) { setError(e instanceof Error ? e.message : 'Choice failed.'); }
    finally { setBusy(false); useCityPulseStore.setState({ submittingPolicy: false }); }
  };
  const resolve = async () => {
    setBusy(true); setError('');
    try {
      await useCityPulseStore.getState().advanceTurn();
      if (useCityPulseStore.getState().city.turn - 1 === turn) throw new Error('The day has not advanced. Check the city update and retry.');
      if (choice?.candidate_id) setOutcome(await api<GameDayOutcome>(`/api/city/${cityId}/game-day/outcome?turn=${turn}`));
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not load outcome.'); }
    finally { setBusy(false); }
  };
  const selected = day?.slate.decisions.find(c => c.id === expanded);
  const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  const costs = (candidate: GeneratedEventCandidate) => catalog.find(p => p.id === candidate.policyId);
  const canEnd = !!cityId && !!(day || choice || pending) && !busy && !resolving && (!day?.slate.decisions.length || !!choice || !!pending);
  return <section className="daily-dock" aria-label="Daily agenda">
    <header className="daily-dock-header"><div><span>DAY {turn + 1}</span><h2>City gameplan</h2><small>{choice || pending ? 'Decision locked · End the day to see its effects' : 'Choose one plan for your city'}</small></div><div className="flex gap-2 items-center">
      {outcome && <button onClick={() => setExpanded(expanded === 'outcome' ? null : 'outcome')}>Last results</button>}
      <button className="daily-end" disabled={!canEnd} onClick={resolve}>{resolving ? 'Resolving…' : 'End day →'}</button>
      <button aria-label={open ? 'Collapse daily choices' : 'Show daily choices'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '⌄' : '⌃'}</button>
    </div></header>
    {error && <p role="alert" className="daily-status">{error}</p>}
    {busy && <p role="status" className="daily-status">{resolving ? 'Applying your decision and listening to residents…' : 'Loading today’s choices…'}</p>}
    {open && <>
      {selected && <div className="daily-expanded" id="daily-choice-details">
        <button className="daily-details-close" aria-label="Close choice details" onClick={() => setExpanded(null)}>×</button>
        <div><span className="daily-kicker">{selected.generation.model === 'authored-catalog' ? 'GAME POLICY' : 'FICTIONAL SIMULATION PROPOSAL'}</span><h3>{selected.title}</h3><p>{selected.proposedAction ?? selected.description}</p>
          <h4>Where the money goes</h4><p>{costs(selected)?.description ?? 'Budget details are unavailable.'}</p>
          <p className="daily-money">{costs(selected) ? `${money(costs(selected)!.upfront_cost)} upfront · ${money(Math.abs(costs(selected)!.recurring_cost))} recurring ${costs(selected)!.recurring_cost < 0 ? 'revenue' : 'cost'}` : 'Loading budget…'}</p>
          <details><summary>Background, tradeoffs & sources</summary><p>{selected.description}</p>{selected.supportedBenefits.map((t,i)=><p key={`b${i}`}>Potential benefit: {t}</p>)}{selected.supportedRisks.map((t,i)=><p key={`r${i}`}>Tradeoff: {t}</p>)}{selected.sourceRefs.map((source,i)=><p key={i}>{/^https?:\/\//.test(source.url) ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title}</p>)}</details>
        </div><div className="daily-choice-action"><label>Your reasoning (optional)<textarea maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} /></label><button className="daily-end" disabled={busy || resolving || !!choice || !!pending || !selected.executable} onClick={()=>choose(selected)}>{choice?.candidate_id === selected.id ? 'Selected for today' : 'Choose this plan'}</button></div>
      </div>}
      {expanded === 'outcome' && outcome && <div className="daily-expanded"><div><h3>Day {outcome.turn+1} · {outcome.candidate.title}</h3><p>Happiness {outcome.before.city.happiness} → {outcome.after.city.happiness} · Treasury {money(outcome.before.city.treasury)} → {money(outcome.after.city.treasury)}</p><p>Resident reactions: {outcome.reactionStatus}</p>{outcome.reactions.map(r=><p key={r.residentId}>{r.reaction} <SpeakText text={r.reaction} /></p>)}</div></div>}
      {!cityId && <p className="daily-status">Connect to the database to see today’s choices.</p>}
      {cityId && !day && <button className="daily-end m-3" disabled={busy || /day is preparing/i.test(error)} onClick={prepare}>{/failed/i.test(error) ? 'Retry preparation' : 'Prepare today’s choices'}</button>}
      {day?.slate.decisions.length === 0 && <p className="daily-status">No choices available today. You can end the day.</p>}
      <div className="daily-card-row">{day?.slate.decisions.map((candidate,index) => {
        const policy = costs(candidate); const isSelected=choice?.candidate_id === candidate.id;
        return <button key={candidate.id} className={`daily-choice-card ${expanded===candidate.id ? 'expanded' : ''} ${isSelected ? 'chosen' : ''}`} aria-expanded={expanded===candidate.id} aria-controls="daily-choice-details" onClick={()=>setExpanded(expanded===candidate.id ? null : candidate.id)}>
          <span className="daily-card-top"><span className="daily-card-number">0{index+1}</span><span>{isSelected ? '✓ SELECTED' : candidate.category.replaceAll('_',' ')}</span></span>
          <h3>{candidate.title}</h3><p>{policy?.description ?? candidate.proposedAction ?? candidate.description}</p>
          <div className="daily-card-budget"><strong>{policy ? money(policy.upfront_cost) : '—'}</strong><span>upfront</span></div>
          <div className="daily-card-foot"><span>{policy ? policy.recurring_cost === 0 ? 'No recurring cost' : `${money(Math.abs(policy.recurring_cost))} recurring ${policy.recurring_cost < 0 ? 'revenue' : 'cost'}` : 'Budget unavailable'}</span><b>{expanded===candidate.id ? 'Less −' : 'Details ↗'}</b></div>
        </button>;
      })}</div>
    </>}
  </section>;
}
