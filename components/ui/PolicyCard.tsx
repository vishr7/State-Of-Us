'use client';

import { useCityPulseStore } from '@/lib/store';
import { Policy } from '@/lib/types';

// ============================================================
// PolicyCard — one policy in the bottom strip.
// Shows icon, title, description, effect bullets, Enact button.
// ============================================================

// Category icon backgrounds and colors
const CAT_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  housing:     { bg: '#FFFFFF', color: '#EF4444', icon: '🏠' },
  transit:     { bg: '#FFFFFF', color: '#3B82F6', icon: '🚆' },
  taxes:       { bg: '#FFFFFF', color: '#F59E0B', icon: '🪙' },
  safety:      { bg: '#FFFFFF', color: '#60A5FA', icon: '🛡️' },
  business:    { bg: '#FFFFFF', color: '#8B5CF6', icon: '💼' },
  environment: { bg: '#FFFFFF', color: '#22C55E', icon: '🌿' },
};

interface PolicyCardProps {
  policy: Policy;
}

export default function PolicyCard({ policy }: PolicyCardProps) {
  const enactPolicyById = useCityPulseStore(s => s.enactPolicyById);
  const { icon } = CAT_STYLE[policy.category] ?? CAT_STYLE.housing;

  const cost = policy.upfrontCost;
  const fmt = (n: number) => `$${n.toLocaleString()}`;

  return (
    <div
      className="card-hover flex flex-col justify-between rounded-xl p-3 flex-shrink-0"
      style={{
        width: 290,
        background: '#132338',
        border: '1px solid #1E385A',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      <div>
        {/* Header row: icon in white box + title */}
        <div className="flex items-start gap-2.5 mb-2">
          <div
            className="flex items-center justify-center text-xl rounded-xl flex-shrink-0 bg-white shadow-sm"
            style={{ width: 38, height: 38 }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold leading-tight" style={{ color: '#F0F4FA' }}>
              {policy.name}
            </div>
            <div className="text-xs leading-tight mt-0.5 line-clamp-2" style={{ color: '#8295AD' }}>
              {policy.description}
            </div>
          </div>
        </div>

        {/* Effect bullets */}
        <div className="space-y-1 mb-2">
          {policy.effects.slice(0, 2).map((eff, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span
                className="font-bold flex-shrink-0"
                style={{ color: eff.isPositive ? '#22C55E' : '#EF4444' }}
              >
                {eff.isPositive ? '+' : '−'}
              </span>
              <span className="leading-tight font-medium" style={{ color: eff.isPositive ? '#4ADE80' : '#F87171' }}>
                {eff.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer: cost + Enact button */}
      <div className="flex items-center justify-between pt-1 border-t border-[#1C324E] mt-auto">
        <div>
          {cost > 0 ? (
            <span className="text-xs font-bold" style={{ color: '#EF4444' }}>
              −{fmt(cost)}
            </span>
          ) : (
            <span className="text-xs font-semibold" style={{ color: '#22C55E' }}>
              Balanced
            </span>
          )}
        </div>
        <button
          onClick={() => enactPolicyById(policy.id)}
          className="text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm hover:brightness-110 cursor-pointer"
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
