'use client';

import { useState } from 'react';
import { useCityPulseStore, selectPolicyLock, unaffordableReason } from '@/lib/store';
import { CategoryId, Policy } from '@/lib/types';

// ============================================================
// PolicyBrowserModal — full list of all policies, filterable
// ============================================================

const CATEGORIES: { id: CategoryId | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'housing', label: 'Housing' },
  { id: 'transit', label: 'Transit' },
  { id: 'taxes', label: 'Taxes' },
  { id: 'safety', label: 'Safety' },
  { id: 'business', label: 'Business' },
  { id: 'environment', label: 'Environment' },
];

const CAT_STYLE: Record<string, { color: string; icon: string }> = {
  housing:     { color: '#FF7B42', icon: '🏠' },
  transit:     { color: '#3B82F6', icon: '🚌' },
  taxes:       { color: '#FFB81C', icon: '💰' },
  safety:      { color: '#60A5FA', icon: '🛡️' },
  business:    { color: '#8B5CF6', icon: '💼' },
  environment: { color: '#22C55E', icon: '🌿' },
};

interface PolicyRowProps {
  policy: Policy;
  onEnact: (id: string) => void;
}

function PolicyRow({ policy, onEnact }: PolicyRowProps) {
  const live = useCityPulseStore(s => !!s.backendLink);
  const lock = useCityPulseStore(selectPolicyLock);
  const treasury = useCityPulseStore(s => s.city.treasury);
  const shortfall = unaffordableReason(treasury, policy);
  const [expanded, setExpanded] = useState(false);
  const { color, icon } = CAT_STYLE[policy.category] ?? { color: '#94A3B8', icon: '📋' };
  const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;

  const statusColors: Record<string, string> = {
    proposed: '#3B82F6', active: '#22C55E', expired: '#64748B', rejected: '#EF4444',
  };

  return (
    <div
      className="rounded-xl p-3 cursor-pointer transition-colors"
      style={{ background: '#0D1E30', border: '1px solid #1E3050' }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center text-lg rounded-xl flex-shrink-0"
          style={{ width: 40, height: 40, background: `${color}22` }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold" style={{ color: '#F0F4FA' }}>{policy.name}</div>
              <div className="text-xs mt-0.5 leading-tight" style={{ color: '#64748B' }}>
                {policy.description}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span
                className="badge"
                style={{ background: `${statusColors[policy.status]}22`, color: statusColors[policy.status] }}
              >
                {policy.status.charAt(0).toUpperCase() + policy.status.slice(1)}
              </span>
              {policy.upfrontCost > 0 && (
                <span className="text-xs" style={{ color: '#EF4444' }}>{fmt(policy.upfrontCost)}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: '#1E3050' }}>
          <div className="text-xs font-bold mb-1" style={{ color: '#94A3B8' }}>EFFECTS:</div>
          {policy.effects.map((eff, i) => (
            <div key={i} className="flex items-start gap-1">
              <span className="text-xs font-bold" style={{ color: eff.isPositive ? '#22C55E' : '#EF4444' }}>
                {eff.isPositive ? '+' : '−'}
              </span>
              <span className="text-xs" style={{ color: '#94A3B8' }}>
                {eff.label}
                {(live || eff.turnsDelay > 0) && (
                  <span style={{ color: '#64748B' }}> {live ? '(next resolved turn)' : `(in ${eff.turnsDelay} turn${eff.turnsDelay > 1 ? 's' : ''})`}</span>
                )}
              </span>
            </div>
          ))}
          <div className="text-xs italic mt-2 pt-2 border-t" style={{ color: '#64748B', borderColor: '#1E3050' }}>
            Pittsburgh context: {policy.pittsburghNote}
          </div>
          {policy.status === 'proposed' && (
            <button
              disabled={!!lock || !!shortfall}
              title={lock ?? shortfall ?? undefined}
              onClick={e => { e.stopPropagation(); onEnact(policy.id); }}
              className="w-full mt-2 py-2 rounded-lg text-sm font-bold transition-all active:scale-95"
              style={{ background: '#3B82F6', color: 'white' }}
            >
              {lock ? 'Decision locked — current policy in progress' : shortfall ? `Not enough cash — ${fmt(policy.upfrontCost)} needed` : `Enact Policy — ${fmt(policy.upfrontCost)} upfront`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ------ Main Modal -------------------------------------------

export default function PolicyBrowserModal() {
  const openVoices = () => { useCityPulseStore.getState().setPolicyBrowser(false); useCityPulseStore.getState().setTownHall(true); };
  const [filter, setFilter] = useState<CategoryId | 'all'>('all');
  const policies = useCityPulseStore(s => s.policies);
  const setPolicyBrowser = useCityPulseStore(s => s.setPolicyBrowser);
  const enactPolicyById = useCityPulseStore(s => s.enactPolicyById);

  const displayed = filter === 'all'
    ? policies
    : policies.filter(p => p.category === filter);

  const proposed = displayed.filter(p => p.status === 'proposed');
  const active = displayed.filter(p => p.status === 'active');

  const handleEnact = (id: string) => {
    enactPolicyById(id);
    // Don't close — let user see the status change
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div
        className="rounded-2xl flex flex-col w-full max-w-2xl"
        style={{ background: '#0F1B2D', border: '1px solid #1E3050', height: '80vh' }}
      >
        <button onClick={openVoices} className="m-3 px-3 py-2 rounded-lg bg-slate-800 text-amber-200 text-sm">Compare policies & hear residents →</button>
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid #1E3050' }}
        >
          <div>
            <h2 className="text-lg font-black" style={{ color: '#F0F4FA' }}>Policy Browser</h2>
            <p className="text-xs" style={{ color: '#64748B' }}>
              {proposed.length} proposed • {active.length} active
            </p>
          </div>
          <button
            onClick={() => setPolicyBrowser(false)}
            className="px-3 py-1.5 rounded-lg text-sm font-bold"
            style={{ color: '#64748B', background: '#162236' }}
          >✕ Close</button>
        </div>

        {/* Category filter */}
        <div
          className="flex gap-2 px-5 py-3 overflow-x-auto"
          style={{ borderBottom: '1px solid #1E3050' }}
        >
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0 transition-colors"
              style={{
                background: filter === cat.id ? '#3B82F6' : '#162236',
                color: filter === cat.id ? 'white' : '#94A3B8',
                border: `1px solid ${filter === cat.id ? '#3B82F6' : '#1E3050'}`,
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Policy list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {displayed.length === 0 ? (
            <div className="text-center py-12" style={{ color: '#64748B' }}>
              No policies in this category.
            </div>
          ) : (
            displayed.map(policy => (
              <PolicyRow key={policy.id} policy={policy} onEnact={handleEnact} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
