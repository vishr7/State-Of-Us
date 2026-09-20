'use client';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useCityPulseStore } from '@/lib/store';
import type { GameDayResponse, GameDayOutcome, GameDayDecision } from '@/database/gameplay/contracts';
import type { GeneratedEventCandidate } from '@/lib/signals/generated-events';
import { SpeakText } from '../ui/InsightView';

export const useAgenda = create<{ open: boolean; setOpen: (open: boolean) => void }>(set => ({ open: false, setOpen: open => set({ open }) }));
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
      useCityPulseStore.getState().announce(`${candidate.title} is selected for today. End the day to apply its effects.`, 'info');
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
  if (!open) return null;
  return <div className="insights-backdrop"><section className="insights-modal" role="dialog" aria-modal="true" aria-label="Daily agenda">
    <header><div><span className="insights-eyebrow">PITTSBURGH · DAY {turn + 1}</span><h2>Today’s decisions</h2><p>Review the evidence. Choose one action. See how the city responds.</p></div><button aria-label="Close daily agenda" onClick={() => setOpen(false)}>×</button></header>
    <div className="insight-results p-5">
      {!cityId && <p>Connect to the database to load the daily agenda.</p>}
      {error && <p role="alert" className="insight-notice">{error}</p>}
      {busy && <p role="status">{resolving ? 'Resolving the day and listening to residents…' : 'Loading today’s agenda…'}</p>}
      {cityId && !day && <button className="insight-generate" disabled={busy || /day is preparing/i.test(error)} onClick={prepare}>{/failed/i.test(error) ? 'Retry event preparation' : 'Prepare today’s events'}</button>}
      {day && day.slate.decisions.length === 0 && <p>No executable events were selected for today. You can end the day without a new policy.</p>}
      {day?.slate.decisions.map(candidate => <article className="insight-section" key={candidate.id}>
        <small>{candidate.generation.model === 'authored-catalog' ? 'Game policy · ' : 'From news · '}{candidate.category.replaceAll('_',' ')} · {candidate.scale} · {candidate.estimatedDurationDays ?? '—'} days estimated</small>
        <h3>{candidate.title}</h3><p>{candidate.description}</p><p className="mt-2">{candidate.proposedAction ?? candidate.problem}</p>
        <div className="grid md:grid-cols-2 gap-4 my-3"><div><h4>Potential benefits</h4>{candidate.supportedBenefits.map((text,i)=><p key={i}>{text}</p>)}</div><div><h4>Risks & tradeoffs</h4>{candidate.supportedRisks.map((text,i)=><p key={i}>{text}</p>)}</div></div>
        <details><summary>Sources & evidence</summary>{candidate.sourceRefs.map((source,i)=><p key={i}><a href={/^https?:\/\//.test(source.url) ? source.url : undefined} target="_blank" rel="noreferrer">{source.title} · {source.publisher}</a></p>)}</details>
        <button className="insight-generate mt-3" disabled={busy || resolving || !!choice || !!pending || !candidate.executable} onClick={() => choose(candidate)}>{choice?.candidate_id === candidate.id ? 'Selected for today' : 'Choose this action'}</button>
      </article>)}
      {day && !choice && !pending && <label className="block my-3">Your reasoning (optional)<textarea className="block w-full rounded-lg bg-slate-800 p-3" maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>}
      {(choice || pending) && <p className="insight-notice">Decision locked for today. End the day to apply its effects.</p>}
      {cityId && (day || choice || pending) && <button className="insight-generate" disabled={busy || resolving || (!!day?.slate.decisions.length && !choice && !pending)} onClick={resolve}>End day & see results →</button>}
      {outcome && <section className="insight-section mt-5"><h3>Day {outcome.turn + 1} results · {outcome.candidate.title}</h3><p>Happiness: {outcome.before.city.happiness} → {outcome.after.city.happiness} · Treasury: ${outcome.before.city.treasury.toLocaleString()} → ${outcome.after.city.treasury.toLocaleString()}</p><p>Resident reactions: {outcome.reactionStatus}</p>{outcome.reactions.map(reaction => <article className="my-4" key={reaction.residentId}><h4>{outcome.after.residents.find(r => r.id === reaction.residentId)?.occupation ?? 'Resident'} · {reaction.sentiment.replaceAll('_',' ')}</h4><p>{reaction.reaction}</p><p className="insight-caption">{reaction.mainReason}</p><SpeakText text={reaction.reaction} /></article>)}</section>}
    </div>
  </section></div>;
}
