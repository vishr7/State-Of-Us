'use client';

import { useCityPulseStore } from '@/lib/store';
import { Policy } from '@/lib/types';

// ============================================================
// PolicyCard — one policy in the bottom strip.
// Shows icon, title, description, effect bullets, Enact button.
// ============================================================

// Category icon backgrounds and colors
const CAT_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  housing:     { bg: '#FF7B4222', color: '#FF7B42', icon: '🏠' },
  transit:     { bg: '#3B82F622', color: '#3B82F6', icon: '🚌' },
  taxes:       { bg: '#FFB81C22', color: '#FFB81C', icon: '💰' },
  safety:      { bg: '#3B82F622', color: '#60A5FA', icon: '🛡️' },
  business:    { bg: '#8B5CF622', color: '#8B5CF6', icon: '💼' },
  environment: { bg: '#22C55E22', color: '#22C55E', icon: '🌿' },
};

interface PolicyCardProps {
  policy: Policy;
}

export default function PolicyCard({ policy }: PolicyCardProps) {
  const enactPolicyById = useCityPulseStore(s => s.enactPolicyById);
  const { bg, color, icon } = CAT_STYLE[policy.category] ?? CAT_STYLE.housing;

  const cost = policy.upfrontCost;
  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;

  return (
    <div
      className="card-hover flex flex-col rounded-xl p-2.5 flex-shrink-0"
      style={{
        width: 240,
        background: '#162236',
        border: '1px solid #1E3050',
        minHeight: 110,
      }}
    >
      {/* Header row: icon + title */}
      <div className="flex items-start gap-2 mb-1.5">
        <div
          className="flex items-center justify-center text-xl rounded-xl flex-shrink-0"
          style={{ width: 36, height: 36, background: bg }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold leading-tight" style={{ color: '#F0F4FA' }}>
            {policy.name}
          </div>
          <div className="text-xs leading-tight mt-0.5 line-clamp-2" style={{ color: '#64748B' }}>
            {policy.description}
          </div>
        </div>
      </div>

      {/* Effect bullets */}
      <div className="space-y-0.5 flex-1">
        {policy.effects.slice(0, 3).map((eff, i) => (
          <div key={i} className="flex items-start gap-1">
            <span
              className="text-xs font-bold flex-shrink-0"
              style={{ color: eff.isPositive ? '#22C55E' : '#EF4444' }}
            >
              {eff.isPositive ? '+' : '−'}
            </span>
            <span className="text-xs leading-tight" style={{ color: '#94A3B8' }}>
              {eff.label}
            </span>
          </div>
        ))}
      </div>

      {/* Enact button + cost */}
      <div className="flex items-center justify-between mt-1.5">
        {cost > 0 && (
          <span className="text-xs" style={{ color: '#64748B' }}>
            Cost: <span style={{ color: '#EF4444' }}>{fmt(cost)}</span>
          </span>
        )}
        <button
          onClick={() => enactPolicyById(policy.id)}
          className="ml-auto text-xs font-bold px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
          style={{
            background: '#3B82F6',
            color: 'white',
          }}
        >
          Enact Policy
        </button>
      </div>
    </div>
  );
}
