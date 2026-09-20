'use client';
import { useEffect, useRef, useState } from 'react';
import type { CityInsight, Metrics } from '@/lib/ai/contracts';
import { useCityPulseStore } from '@/lib/store';

let activeVoice: HTMLAudioElement | null = null;

export function SpeakText({ text }: { text: string }) {
  const [state, setState] = useState('Speak');
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { setState('Speak'); return () => { controller.current?.abort(); audio.current?.pause(); audio.current = null; if (url.current) URL.revokeObjectURL(url.current); url.current = null; }; }, [text]);
  const play = async () => {
    if (state === 'Playing') { audio.current?.pause(); setState('Speak'); return; }
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setState('Loading…');
    try {
      if (!audio.current) {
        const response = await fetch('/api/resident-speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0,900) }), signal: current.signal });
        if (!response.ok) throw new Error('Voice unavailable');
        const blob = await response.blob(); if (current.signal.aborted) return;
        url.current = URL.createObjectURL(blob); audio.current = new Audio(url.current);
        audio.current.onended = () => setState('Speak');
        audio.current.onpause = () => setState('Speak');
      }
      if (activeVoice !== audio.current) activeVoice?.pause();
      activeVoice = audio.current;
      await audio.current.play(); if (!current.signal.aborted) setState('Playing');
    } catch { if (!current.signal.aborted) setState('Retry voice'); }
  };
  return <button className="insight-speak" disabled={state === 'Loading…'} onClick={play} aria-label={`${state} dialogue`}>{state === 'Playing' ? 'Stop voice' : state}</button>;
}
const labels: Record<keyof Metrics, string> = { treasury: 'Treasury', happiness: 'Happiness / 100', approval: 'Approval %', averageRent: 'Monthly rent', revenue: 'Annual revenue', expenses: 'Annual expenses' };
function value(key: keyof Metrics, n: number) { return ['happiness','approval'].includes(key) ? n.toFixed(1) : `$${Math.round(n).toLocaleString()}`; }
export default function InsightView({ insight }: { insight: CityInsight }) {
  const { facts, commentary } = insight;
  const currentTurn = useCityPulseStore(s => s.city.turn);
  const person = (id: string) => facts.residents.find(r => r.id === id);
  return <div className="insight-view">
    <div className="insight-provenance"><span>{insight.source === 'nemotron' ? 'NVIDIA Nemotron' : 'Scripted fallback'}</span><span>Turn {facts.turn}{facts.turn !== currentTurn ? ' · historical snapshot' : ''}</span></div>
    {insight.notice && <p className="insight-notice" role="status">{insight.notice}</p>}
    <p className="insight-summary">{commentary.summary}</p>
    <section className="insight-section"><h3>{facts.scenarios.length === 2 ? 'Independent next-turn previews' : 'Measured city conditions'}</h3>
      <p className="insight-caption">{facts.scenarios.length === 2 ? 'Both options start from the same city state. Neither is enacted; other queued policies are excluded.' : 'Numbers are calculated by the simulation. AI dialogue does not change them.'}</p>
      <div className="overflow-x-auto"><table className="insight-table"><thead><tr><th>Measure</th><th>{facts.scenarios.length === 2 ? 'Current' : 'Previous'}</th>{facts.scenarios.length === 2 ? facts.scenarios.map(s => <th key={s.policyId}>{s.name}</th>) : <th>Current</th>}</tr></thead><tbody>
        {(Object.keys(labels) as (keyof Metrics)[]).map(key => <tr key={key}><td>{labels[key]}</td><td>{facts.scenarios.length === 2 ? value(key,facts.current[key]) : facts.previous ? value(key,facts.previous[key]) : 'No earlier snapshot'}</td>{facts.scenarios.length === 2 ? facts.scenarios.map(s => <td key={s.policyId}>{value(key,s.metrics[key])}</td>) : <td>{value(key,facts.current[key])}</td>}</tr>)}
      </tbody></table></div>
      {commentary.comparison && <p className="insight-caption mt-3">{commentary.comparison}</p>}
      {facts.scenarios.length === 2 && <div className="overflow-x-auto mt-3"><table className="insight-table"><thead><tr><th>Neighborhood happiness</th><th>Current</th>{facts.scenarios.map(s => <th key={s.policyId}>{s.name}</th>)}</tr></thead><tbody>{facts.neighborhoods.map(n => <tr key={n.name}><td>{n.name}</td><td>{n.happiness.toFixed(1)}</td>{facts.scenarios.map(s => <td key={s.policyId}>{s.neighborhoods.find(b => b.name === n.name)?.after.toFixed(1) ?? '—'}</td>)}</tr>)}</tbody></table></div>}
    </section>
    <section className="insight-section"><h3>Mayor’s briefing <SpeakText text={commentary.mayorSpeech} /></h3><p>{commentary.mayorSpeech}</p></section>
    <section className="insight-section"><h3>Resident thoughts & choices</h3><p className="insight-caption">Generated opinions from synthetic personas—not survey results. Neighborhood happiness is measured; it is not an individual’s score.</p>
      <div className="insight-residents">{commentary.residents.map(r => { const p = person(r.residentId); return <article key={r.residentId}><div className="flex justify-between gap-3"><h4>{p?.name}</h4><span className={`insight-stance ${r.stance}`}>{r.stance}</span></div><small>{p?.occupation} · {p?.neighborhood} · {p?.housing}</small><p>{r.thought}</p><footer><span>Priority: {r.priority}</span><SpeakText text={`${p?.name} says: ${r.thought}`} /></footer></article>; })}</div>
    </section>
    <section className="insight-section"><h3>Neighborhood conversation <SpeakText text={commentary.conversation.map(line => `${person(line.residentId)?.name}: ${line.text}`).join(' ').slice(0,900)} /></h3>
      <ol className="insight-conversation">{commentary.conversation.map((line,index) => <li key={index}><strong>{person(line.residentId)?.name}</strong><p>{line.text}</p></li>)}</ol>
    </section>
  </div>;
}
