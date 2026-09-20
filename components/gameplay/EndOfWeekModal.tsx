'use client';
import { useEffect, useState, useRef } from 'react';
import { demographicImpacts, trialGrade } from '@/lib/trialReport';
import type { GameDayOutcome } from '@/database/gameplay/contracts';
import { useCityPulseStore } from '@/lib/store';
import type { Decision, Policy, SimulationState } from '@/database/types/database';

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch { return null; }
}

interface StatRowProps { label: string; before: number; after: number; format?: (n: number) => string }
function StatRow({ label, before, after, format = String }: StatRowProps) {
  const delta = after - before;
  const positive = delta > 0, negative = delta < 0;
  return (
    <div className="week-recap-stat">
      <span className="week-recap-stat-label">{label}</span>
      <span className="week-recap-stat-value">{format(before)} → {format(after)}</span>
      <span className={`week-recap-stat-delta ${positive ? 'is-up' : negative ? 'is-down' : ''}`}>
        {delta === 0 ? '—' : `${positive ? '+' : ''}${format(delta)}`}
      </span>
    </div>
  );
}

/** End-of-Day-6 trial recap, using saved snapshots and recorded reactions. */
export default function EndOfWeekModal({ cityId, onDismiss }: { cityId: string; onDismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  const [startState, setStartState] = useState<SimulationState | null>(null);
  const [endState, setEndState] = useState<SimulationState | null>(null);
  const [outcomes, setOutcomes] = useState<GameDayOutcome[]>([]);
  const city = useCityPulseStore(s => s.city);
  const residents = useCityPulseStore(s => s.residents);
  const [baseline, setBaseline] = useState<SimulationState['city'] | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [catalog, setCatalog] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [snapshot, decisionRows, policies, finalSnapshot, results] = await Promise.all([
        getJson<SimulationState>(`/api/city/${cityId}/snapshot?turn=0`),
        getJson<Decision[]>(`/api/city/${cityId}/decisions`),
        getJson<Policy[]>('/api/policies'),
        getJson<SimulationState>(`/api/city/${cityId}/snapshot?turn=6`),
        Promise.all(Array.from({ length: 6 }, (_, turn) => getJson<GameDayOutcome>(`/api/city/${cityId}/game-day/outcome?turn=${turn}`))),
      ]);
      if (cancelled) return;
      setBaseline(snapshot?.city ?? null);
      setStartState(snapshot); setEndState(finalSnapshot);
      setOutcomes(results.filter((r): r is GameDayOutcome => r !== null));
      setDecisions((decisionRows ?? []).filter(d => d.turn < 6));
      setCatalog(policies ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [cityId]);

  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const policyName = (policyId: string) => catalog.find(p => p.id === policyId)?.name ?? policyId;

  const grade = startState && endState ? trialGrade(startState, endState) : null;
  const finalCity = endState?.city ?? city;
  const impacts = startState && endState ? demographicImpacts(startState, endState) : [];
  const ranked = [...impacts].sort((a,b) => b.happiness - a.happiness);
  const positive = ranked.find(r => r.happiness > 0);
  const negative = [...ranked].reverse().find(r => r.happiness < 0);
  const seen = new Set<string>();
  const recorded = outcomes.flatMap(o => o.reactions.map(r => ({ ...r, day: o.turn + 1, policy: o.candidate.title })))
    .sort((a,b) => a.supportScore - b.supportScore);
  const balanced = recorded.length ? [recorded[0], recorded[recorded.length - 1], ...recorded.slice(1, -1)] : [];
  const quotes = balanced.filter(r => { if (seen.has(r.residentId)) return false; seen.add(r.residentId); return true; }).slice(0, 4);
  const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
  return (
    <dialog ref={dialog} className="trial-report-dialog" onCancel={e => e.preventDefault()}>
      <section className="insights-modal week-recap" role="dialog" aria-modal="true" aria-label="Six-day trial report">
        <header>
          <div>
            <span className="insights-eyebrow">✦ DAY 6 COMPLETE · TRIAL REPORT</span>
            <h2>Your city, six days later</h2>
            <p>Trial complete! Let’s see who felt the difference in {city.name}.</p>
          </div>
        </header>
        <div className="week-recap-body">
          {loading ? <p className="daily-status">Putting your city report together…</p> : <>
            {grade ? <section className="trial-grade" aria-label={`Overall grade ${grade.letter}, ${grade.score} out of 100`}>
              <div className="trial-grade-letter">{grade.letter}<small>{grade.score}/100</small></div>
              <div><span className="insights-eyebrow">YOUR MAYORAL REPORT CARD</span><h3>{grade.summary}</h3>
                <p>Happiness {signed(grade.happiness)} · Approval {signed(grade.approval)} points · Largest group happiness loss {grade.worstLoss.toFixed(1)} points</p>
                <details><summary>How your grade works</summary><p>Start at 70. Add 2 points per city happiness point gained and 1 per approval point gained; decreases subtract points. Subtract 2 points per happiness point lost by the hardest-hit measured demographic group. Score is rounded and limited to 0–100. A: 90+, B: 80–89, C: 70–79, D: 60–69, F: below 60. This game grade reflects all trial events, not just your policies.</p></details>
              </div>
            </section> : <p className="trial-report-note">Grade unavailable: complete city and demographic snapshots are needed.</p>}
            <h3 className="week-recap-heading">The big picture</h3>
            {!baseline && <p>Starting city totals are unavailable; comparisons below cannot show the full trial change.</p>}
            <div className="week-recap-stats">
              <StatRow label="Treasury" before={baseline?.treasury ?? city.treasury} after={finalCity.treasury} format={money} />
              <StatRow label="Revenue" before={baseline?.revenue ?? city.revenue} after={finalCity.revenue} format={money} />
              <StatRow label="Happiness" before={baseline?.happiness ?? city.happiness} after={finalCity.happiness} />
              <StatRow label="Approval" before={baseline?.approval ?? city.approval} after={finalCity.approval} format={n => `${n}%`} />
              <StatRow label="Population" before={baseline?.population ?? city.population} after={finalCity.population} format={n => n.toLocaleString()} />
            </div>

            <h3 className="week-recap-heading">Who felt the difference?</h3>
            <p className="trial-report-note">Changes during your six days, including policy effects and other city events. Groups use starting incomes; averages are weighted by represented population. Age and income groups overlap.</p>
            <div className="trial-report-highlights">
              <p>🌟 <strong>Biggest happiness gain</strong><br />{positive ? `${positive.label}: ${signed(positive.happiness)} points` : 'No group recorded a happiness increase.'}</p>
              <p>🧭 <strong>Needs more attention</strong><br />{negative ? `${negative.label}: ${signed(negative.happiness)} points` : 'No measured group lost happiness.'}</p>
            </div>
            {impacts.length ? <div className="week-recap-stats">{impacts.map(group => <article className="week-recap-stat" key={group.label}>
              <strong>{group.label}</strong><small>{group.population.toLocaleString()} represented residents</small>
              <span className={`week-recap-stat-delta ${group.happiness > 0 ? 'is-up' : group.happiness < 0 ? 'is-down' : ''}`}>Happiness {signed(group.happiness)} points</span>
              <span>Housing cost {signed(group.housing)} $/month</span><span>Commute {signed(group.commute)} minutes</span>
            </article>)}</div> : <p>Demographic snapshots are unavailable. No impact estimates have been substituted.</p>}
            <h3 className="week-recap-heading">Voices from your city</h3>
            <p className="trial-report-note">Recorded simulated resident reactions from the trial.</p>
            {quotes.length ? <div className="trial-testimonies">{quotes.map(q => <blockquote key={q.residentId}>
              <p>“{q.reaction}”</p><footer>{residents.find(r => r.id === q.residentId)?.name ?? 'Resident'} · {endState?.residents.find(r => r.id === q.residentId)?.occupation.replaceAll('_', ' ') ?? 'Community member'} · Day {q.day} · {q.policy} · {q.sentiment.replaceAll('_', ' ')}</footer>
            </blockquote>)}</div> : <p>Resident testimonies aren’t available yet.</p>}
            <h3 className="week-recap-heading">Actions you took</h3>
            {decisions.length === 0
              ? <p className="daily-status">No plans were enacted during the trial — the city ran on autopilot.</p>
              : <ul className="week-recap-actions">
                  {decisions.map(decision => (
                    <li key={decision.id}>
                      <span className="week-recap-action-day">DAY {decision.turn + 1}</span>
                      <span className="week-recap-action-name">{policyName(decision.policy_id)}</span>
                      {decision.player_reasoning && <span className="week-recap-action-reason">“{decision.player_reasoning}”</span>}
                    </li>
                  ))}
                </ul>}

            <div className="week-recap-handoff">
              <p>Your trial period is complete. Keep this city, your budget, and your decisions—and see what happens next in sandbox play.</p>

            </div>
          </>}
        </div>
        <footer className="trial-report-footer"><button className="daily-end" onClick={onDismiss}>Continue in sandbox →</button></footer>
      </section>
    </dialog>
  );
}
