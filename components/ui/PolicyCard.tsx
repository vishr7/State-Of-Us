'use client';

import { useCityPulseStore, selectPolicyLock } from '@/lib/store';
import { Policy } from '@/lib/types';

const CATEGORY: Record<string, { color: string; icon: string }> = {
  housing: { color: '#f4b08a', icon: '🏠' },
  transit: { color: '#93c5fd', icon: '🚆' },
  taxes: { color: '#f4ce7f', icon: '🪙' },
  safety: { color: '#a5c7ff', icon: '🛡️' },
  business: { color: '#c4b5fd', icon: '💼' },
  environment: { color: '#86d9b2', icon: '🌿' },
};
const money = (value: number) => `$${Math.abs(value).toLocaleString('en-US')}`;

export default function PolicyCard({ policy }: { policy: Policy }) {
  const live = useCityPulseStore(s => !!s.backendLink);
  const lock = useCityPulseStore(selectPolicyLock);
  const enactPolicyById = useCityPulseStore(s => s.enactPolicyById);
  const { color, icon } = CATEGORY[policy.category] ?? CATEGORY.housing;
  // Keep a tradeoff visible when a proposal has both benefits and drawbacks.
  const outcomes = policy.effects.filter(effect => !['treasury', 'expenses'].includes(effect.field));
  const positive = outcomes.find(effect => effect.isPositive);
  const negative = outcomes.find(effect => !effect.isPositive);
  const effects = positive && negative ? [positive, negative] : outcomes.slice(0, 2);

  return (
    <article className="policy-proposal" aria-label={policy.name}>
      <div className="flex items-start gap-3">
        <span className="policy-proposal-icon" style={{ color, background: `${color}14`, borderColor: `${color}30` }} aria-hidden="true">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="policy-proposal-title" title={policy.name}>{policy.name}</h3>
          <p className="policy-proposal-description" title={policy.description}>{policy.description}</p>
        </div>
      </div>
      <ul className="policy-effects" aria-label="Key effects">
        {effects.map((effect, index) => (
          <li key={index} title={`${effect.label}${live ? ' · On the next resolved turn' : effect.turnsDelay ? ` · In ${effect.turnsDelay} turn${effect.turnsDelay === 1 ? '' : 's'}` : ''}`}>
            <span className="policy-effect-dot" style={{ background: effect.isPositive ? '#6ee7b7' : '#fda4af' }} aria-hidden="true" />
            <span className="truncate" style={{ color: effect.isPositive ? '#a4d9c1' : '#f0afb9' }}>{effect.label}</span>
            {(live || effect.turnsDelay > 0) && <span className="policy-effect-delay">{live ? 'Next turn' : `In ${effect.turnsDelay} turn${effect.turnsDelay === 1 ? '' : 's'}`}</span>}
          </li>
        ))}
      </ul>
      <footer className="policy-proposal-footer">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5"><span className="text-sm font-semibold text-slate-100 tabular-nums">{policy.upfrontCost === 0 ? '$0' : `${policy.upfrontCost < 0 ? '+' : ''}${money(policy.upfrontCost)}`}</span><span className="text-[10px] text-slate-400">{policy.upfrontCost < 0 ? 'upfront revenue' : 'upfront'}</span></div>
          <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{policy.recurringCost === 0 ? 'No recurring cost' : `${policy.recurringCost < 0 ? '+' : '−'}${money(policy.recurringCost)} / turn${policy.recurringCost < 0 ? ' revenue' : ''}`}</div>
        </div>
        <button disabled={!!lock} title={lock ?? undefined} onClick={() => enactPolicyById(policy.id)} className="policy-enact-button" aria-label={`Enact ${policy.name}`}>{lock ? 'Decision locked' : 'Enact policy'} <span aria-hidden="true">→</span></button>
      </footer>
    </article>
  );
}
