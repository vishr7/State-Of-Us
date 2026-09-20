'use client';
import { useState } from 'react';
import { useCityPulseStore } from '@/lib/store';
import type { Resident, Policy } from '@/lib/types';
import type { CityInsight } from '@/lib/ai/contracts';
import { SpeakText } from './InsightView';
export default function ResidentPolicyThought({ resident, policy }: { resident: Resident; policy: Policy }) {
  const request = useCityPulseStore(s=>s.requestInsights);
  const link = useCityPulseStore(s=>s.backendLink);
  const [result,setResult] = useState<CityInsight|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const thought = result?.commentary.residents.find(r=>r.residentId===resident.id);
  return <section className="insight-section"><h3>Thoughts on {policy.name}</h3><p className="insight-caption">AI-generated opinion from this synthetic persona. It does not change their simulated happiness.</p>
    <button className="insight-generate" disabled={busy || !link?.policyIdByLocalId[policy.id]} onClick={async()=>{setBusy(true);setError('');const data=await request({mode:'resident',policyIds:[link!.policyIdByLocalId[policy.id]],residentId:resident.id});setResult(data);setBusy(false);if(!data)setError(useCityPulseStore.getState().insightsError || 'Analysis unavailable.');}}>{busy?'Considering the policy…':'Ask Nemotron'}</button>
    {error && <p role="alert">{error}</p>}{thought && <><p className="insight-provenance">{result?.source === 'nemotron'?'Nemotron':'Scripted fallback'} · {thought.stance}</p><p>{thought.thought}</p><SpeakText text={thought.thought}/></>}
  </section>;
}
