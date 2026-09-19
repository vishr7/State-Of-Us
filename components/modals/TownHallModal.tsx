'use client';
import { useRef, useState } from 'react';
import { useCityPulseStore } from '@/lib/store';
import type { CityInsight, InsightRequest } from '@/lib/ai/contracts';
import InsightView from '../ui/InsightView';

export default function TownHallModal() {
  const close = useCityPulseStore(s => s.setTownHall);
  const policies = useCityPulseStore(s => s.policies);
  const residents = useCityPulseStore(s => s.residents);
  const link = useCityPulseStore(s => s.backendLink);
  const history = useCityPulseStore(s => s.insights);
  const request = useCityPulseStore(s => s.requestInsights);
  const available = policies.filter(p => p.status === 'proposed' && link?.policyIdByLocalId[p.id]);
  const [mode,setMode] = useState<InsightRequest['mode']>('briefing');
  const [policyA,setPolicyA] = useState(available[0]?.id ?? '');
  const [policyB,setPolicyB] = useState(available[1]?.id ?? '');
  const [resident,setResident] = useState(residents[0]?.id ?? '');
  const [question,setQuestion] = useState('');
  const [result,setResult] = useState<CityInsight | null>(history[0] ?? null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const generation = useRef(0);
  const generate = async () => {
    const run = ++generation.current; setBusy(true); setError('');
    const ids = mode === 'briefing' ? [] : [policyA, ...(mode === 'compare' ? [policyB] : [])].map(id => link?.policyIdByLocalId[id]).filter((id): id is string => !!id);
    const insight = await request({ mode, policyIds: ids, residentId: mode === 'resident' ? resident : undefined, question: question.trim() || undefined });
    if (run !== generation.current) return;
    setBusy(false); if (insight) setResult(insight); else setError(useCityPulseStore.getState().insightsError ?? 'Could not generate analysis.');
  };
  const canRun = !!link && !busy && (mode === 'briefing' || !!policyA) && (mode !== 'compare' || (!!policyB && policyB !== policyA));
  return <div className="insights-backdrop"><section className="insights-modal" role="dialog" aria-modal="true" aria-label="City voices and policy lab">
    <header><div><span className="insights-eyebrow">PITTSBURGH · PUBLIC PERSPECTIVES</span><h2>City voices & policy lab</h2><p>Hear different priorities. Compare the consequences.</p></div><button onClick={() => { generation.current++; close(false); }} aria-label="Close City voices">×</button></header>
    <nav aria-label="Analysis mode">{([['briefing','City briefing'],['resident','Resident thoughts'],['debate','Town hall debate'],['compare','Compare policies']] as const).map(([id,label]) => <button key={id} aria-pressed={mode===id} onClick={() => {setMode(id);setError('');}}>{label}</button>)}</nav>
    <div className="insight-inputs">
      {mode !== 'briefing' && <label>Policy<select value={policyA} onChange={e => setPolicyA(e.target.value)}><option value="">Choose a proposed policy</option>{available.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      {mode === 'compare' && <label>Compare with<select value={policyB} onChange={e=>setPolicyB(e.target.value)}><option value="">Choose another policy</option>{available.filter(p=>p.id!==policyA).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      {mode === 'resident' && <label>Resident<select value={resident} onChange={e=>setResident(e.target.value)}>{residents.map(r=><option key={r.id} value={r.id}>{r.name} · {r.occupation}</option>)}</select></label>}
      <label className="insight-question">Ask about the tradeoffs (optional)<input maxLength={400} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Who benefits, and who might be concerned?" /></label>
      <button className="insight-generate" disabled={!canRun} onClick={generate}>{busy ? 'Listening to the city…' : 'Generate analysis'}</button>
    </div>
    {!link && <p className="insight-notice">Connect to the database to analyze real simulation outcomes.</p>}
    {mode !== 'briefing' && available.length === 0 && <p className="insight-notice">No proposed policies remain. City briefing and past analyses are still available.</p>}
    {error && <p className="insight-notice" role="alert">{error}</p>}
    {busy && <p className="insight-caption px-5" role="status">Nemotron is considering the current snapshot and different resident priorities. The simulation is unchanged.</p>}
    <div className="insight-results">{result ? <InsightView insight={result} /> : <div className="insight-empty"><h3>A city has more than one point of view.</h3><p>Generate a briefing, listen to residents discuss a proposal, or compare two policies before deciding.</p></div>}</div>
    {history.length>0 && <footer className="insight-history"><label>Recent analyses <select value={result?.id ?? ''} onChange={e=>setResult(history.find(i=>i.id===e.target.value) ?? null)}>{history.map(i=><option key={i.id} value={i.id}>Turn {i.facts.turn} · {i.facts.mode} · {i.facts.policies.map(p=>p.name).join(' / ') || 'City briefing'}</option>)}</select></label></footer>}
  </section></div>;
}
