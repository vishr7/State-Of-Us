'use client';
import { useEffect, useState } from 'react';
import { useCityPulseStore } from '@/lib/store';
import type { Decision, Policy, SimulationState } from '@/database/types/database';

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path);
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

/**
 * Shown once, right after the player finishes resolving day 7. Recaps the
 * week (stat gains since the turn-0 snapshot, every decision made) and hands
 * the city off — this is where the scripted seven-day demo ends and ongoing
 * play becomes the player's own.
 */
export default function EndOfWeekModal({ cityId, onDismiss }: { cityId: string; onDismiss: () => void }) {
  const city = useCityPulseStore(s => s.city);
  const [baseline, setBaseline] = useState<SimulationState['city'] | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [catalog, setCatalog] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [snapshot, decisionRows, policies] = await Promise.all([
        getJson<SimulationState>(`/api/city/${cityId}/snapshot?turn=0`),
        getJson<Decision[]>(`/api/city/${cityId}/decisions`),
        getJson<Policy[]>('/api/policies'),
      ]);
      if (cancelled) return;
      setBaseline(snapshot?.city ?? null);
      setDecisions(decisionRows ?? []);
      setCatalog(policies ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [cityId]);

  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const policyName = (policyId: string) => catalog.find(p => p.id === policyId)?.name ?? policyId;

  return (
    <div className="insights-backdrop" style={{ zIndex: 90 }}>
      <section className="insights-modal week-recap" role="dialog" aria-modal="true" aria-label="One week in Pittsburgh — results">
        <header>
          <div>
            <span className="insights-eyebrow">DAY 7 COMPLETE</span>
            <h2>One week in {city.name}</h2>
            <p>Here’s everything that happened while the city ran on your decisions.</p>
          </div>
        </header>
        <div className="week-recap-body">
          {loading ? <p className="daily-status">Tallying the week…</p> : <>
            <h3 className="week-recap-heading">Total gain this week</h3>
            <div className="week-recap-stats">
              <StatRow label="Treasury" before={baseline?.treasury ?? city.treasury} after={city.treasury} format={money} />
              <StatRow label="Revenue" before={baseline?.revenue ?? city.revenue} after={city.revenue} format={money} />
              <StatRow label="Happiness" before={baseline?.happiness ?? city.happiness} after={city.happiness} />
              <StatRow label="Approval" before={baseline?.approval ?? city.approval} after={city.approval} format={n => `${n}%`} />
              <StatRow label="Population" before={baseline?.population ?? city.population} after={city.population} format={n => n.toLocaleString()} />
            </div>

            <h3 className="week-recap-heading">Actions you took</h3>
            {decisions.length === 0
              ? <p className="daily-status">No plans were enacted this week — the city ran on autopilot.</p>
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
              <p>The scripted week is over. From here, it’s up to you to take care of the city.</p>
              <button className="daily-end" onClick={onDismiss}>Continue running {city.name} →</button>
            </div>
          </>}
        </div>
      </section>
    </div>
  );
}
