'use client';

import { useCityPulseStore, selectActiveResident } from '@/lib/store';
import Avatar from '../ui/Avatar';
import ResidentPolicyThought from '../ui/ResidentPolicyThought';

// ============================================================
// ResidentModal — resident profile + agent reasoning + memories
// ============================================================

export default function ResidentModal() {
  const resident = useCityPulseStore(selectActiveResident);
  const selectResident = useCityPulseStore(s => s.selectResident);
  const policies = useCityPulseStore(s => s.policies);
  const setTownHall = useCityPulseStore(s => s.setTownHall);

  if (!resident) return null;

  // Pick a proposed policy to show reasoning for
  const samplePolicy = policies.find(p => p.status === 'proposed' && p.category === 'housing')
    ?? policies.find(p => p.status === 'proposed')
    ?? policies[0];


  const moodColors: Record<string, string> = {
    hopeful: '#22C55E', content: '#3B82F6', neutral: '#EAB308',
    frustrated: '#F97316', angry: '#EF4444',
  };
  const moodColor = moodColors[resident.mood] ?? '#64748B';

  const neighborhood = resident.neighborhood
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div
        className="rounded-2xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto"
        style={{ background: '#0F1B2D', border: '1px solid #1E3050' }}
      >
        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <Avatar initials={resident.portraitInitials} color={resident.portraitColor} size={56} />
          <div className="flex-1">
            <h2 className="text-xl font-black" style={{ color: '#F0F4FA' }}>{resident.name}</h2>
            <div className="text-sm" style={{ color: '#64748B' }}>{resident.occupation}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className="badge"
                style={{ background: `${moodColor}22`, color: moodColor, border: `1px solid ${moodColor}44` }}
              >
                {resident.mood.charAt(0).toUpperCase() + resident.mood.slice(1)}
              </span>
              <span className="text-xs" style={{ color: '#64748B' }}>
                Happiness: <span style={{ color: '#F0F4FA', fontWeight: 700 }}>{resident.happiness}</span>
              </span>
            </div>
          </div>
          <button
            onClick={() => selectResident(null)}
            className="px-2 py-1 rounded-lg text-sm flex-shrink-0"
            style={{ color: '#64748B', background: '#162236' }}
          >✕</button>
        </div>

        {resident.persona && <section className="rounded-xl p-3 mb-4 text-xs text-slate-300 border border-slate-700 bg-slate-800/50">
          <h3 className="font-semibold text-amber-200 mb-2">Synthetic persona · NVIDIA Nemotron</h3>
          <p className="leading-relaxed">{resident.persona.biography}</p>
          <p className="mt-2"><strong>Education:</strong> {resident.persona.education.replace(/_/g, ' ')}</p>
          <p className="mt-1"><strong>Source location:</strong> {resident.persona.sourceCity}, {resident.persona.sourceState}</p>
          <p className="mt-2"><strong>Interests:</strong> {resident.persona.interests.join(' · ') || 'Not provided'}</p>
          <p className="mt-2"><strong>Skills:</strong> {resident.persona.skills.join(' · ') || 'Not provided'}</p>
          <p className="mt-3 text-slate-400">Adapted for this city. Finances, housing, household size, commute, sentiment, dialogue, and appearance below are game-generated; they are not dataset facts.</p>
          <a href="https://huggingface.co/datasets/nvidia/Nemotron-Personas-USA" target="_blank" rel="noreferrer" className="inline-block mt-2 text-blue-300 underline">Dataset attribution · CC BY 4.0</a>
        </section>}
        {/* Bio stats */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { icon: '📍', label: 'Neighborhood', value: neighborhood },
            { icon: '💰', label: 'Annual Income', value: `$${resident.annualIncome.toLocaleString()}`, gold: true },
            { icon: '🏠', label: 'Housing', value: resident.isHomeowner ? 'Homeowner' : 'Renter' },
            { icon: '💳', label: 'Housing Cost', value: `$${resident.housingCost}/mo` },
            { icon: '🚌', label: 'Commute', value: `${resident.commuteMins} min (${resident.commuteMode})` },
            { icon: '👨‍👩‍👧', label: 'Family Size', value: String(resident.familySize) },
            { icon: '🤝', label: 'Govt Trust', value: `${Math.round(resident.governmentTrust * 100)}%` },
            { icon: '🎂', label: 'Age', value: String(resident.age) },
          ].map(({ icon, label, value, gold }) => (
            <div key={label} className="rounded-xl p-2.5" style={{ background: '#162236', border: '1px solid #1E3050' }}>
              <div className="text-xs" style={{ color: '#64748B' }}>
                {icon} {label}
              </div>
              <div className="text-sm font-bold mt-0.5" style={{ color: gold ? '#FFB81C' : '#F0F4FA' }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {samplePolicy && <ResidentPolicyThought key={`${resident.id}-${samplePolicy.id}`} resident={resident} policy={samplePolicy} />}
        {/* Sensitivities */}
        <div className="rounded-xl p-3 mb-4" style={{ background: '#162236', border: '1px solid #1E3050' }}>
          <h3 className="text-xs font-bold mb-2.5" style={{ color: '#94A3B8' }}>POLICY SENSITIVITIES</h3>
          {[
            { label: 'Housing', value: resident.housingSensitivity, color: '#FF7B42' },
            { label: 'Transit', value: resident.transitSensitivity, color: '#3B82F6' },
            { label: 'Taxes', value: resident.taxSensitivity, color: '#FFB81C' },
            { label: 'Environment', value: resident.environmentSensitivity, color: '#22C55E' },
          ].map(({ label, value, color }) => (
            <div key={label} className="mb-1.5">
              <div className="flex justify-between mb-0.5">
                <span className="text-xs" style={{ color: '#64748B' }}>{label}</span>
                <span className="text-xs font-bold" style={{ color }}>{Math.round(value * 100)}%</span>
              </div>
              <div className="rounded-full overflow-hidden" style={{ height: 4, background: '#0A1628' }}>
                <div style={{ width: `${value * 100}%`, height: '100%', background: color, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Agent Reasoning (stubbed Nemotron) */}
        {/* Current quote */}
        <div className="rounded-xl p-3 mb-4" style={{ background: '#162236', border: '1px solid #1E3050' }}>
          <div className="text-xs font-bold mb-1" style={{ color: '#64748B' }}>WHAT THEY SAY</div>
          <p className="text-sm italic" style={{ color: '#94A3B8' }}>
            &ldquo;{resident.currentQuote}&rdquo;
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => { setTownHall(true); selectResident(null); }}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: '#3B82F6', color: 'white' }}
          >
            Open Town Hall
          </button>
          <button
            onClick={() => selectResident(null)}
            className="px-4 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: '#162236', color: '#94A3B8', border: '1px solid #1E3050' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
