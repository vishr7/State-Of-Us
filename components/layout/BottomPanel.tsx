'use client';

import { useState } from 'react';
import { useCityPulseStore } from '@/lib/store';
import PolicyCard from '../ui/PolicyCard';

export default function BottomPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const activeCategoryId = useCityPulseStore(s => s.ui.activeCategoryId);
  const policies = useCityPulseStore(s => s.policies);
  const setPolicyBrowser = useCityPulseStore(s => s.setPolicyBrowser);
  const proposed = policies.filter(p => p.status === 'proposed' && p.category === activeCategoryId);
  const displayed = proposed.slice(0, 3);

  return (
    <section aria-labelledby="policy-panel-heading" className="policy-panel">
      <header className="policy-panel-header">
        <div className="flex items-center gap-3 min-w-0">
          <span className="policy-panel-symbol" aria-hidden="true">≡</span>
          <h2 id="policy-panel-heading" className="text-sm font-semibold text-slate-100 whitespace-nowrap">Proposed policies</h2>
          <span className="policy-category"><span className="capitalize">{activeCategoryId}</span><span className="text-slate-500">/</span>{proposed.length} available</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setPolicyBrowser(true)} className="policy-browse-button">Browse all policies <span aria-hidden="true">↗</span></button>
          <button onClick={() => setCollapsed(value => !value)} aria-expanded={!collapsed} aria-controls="proposed-policy-cards" aria-label={collapsed ? 'Expand proposed policies' : 'Collapse proposed policies'} className="policy-collapse-button">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ transform: collapsed ? 'rotate(180deg)' : undefined }}><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </header>
      {!collapsed && (
        <div id="proposed-policy-cards" className="policy-panel-cards">
          {displayed.length ? displayed.map(policy => <PolicyCard key={policy.id} policy={policy} />) : (
            <div className="policy-empty">
              <span className="text-emerald-300 text-xl" aria-hidden="true">✓</span>
              <div><p className="text-sm font-medium text-slate-200">You’re all caught up on <span className="capitalize">{activeCategoryId}</span></p><p className="text-xs text-slate-400 mt-1">Choose another category or browse all policies to plan your next move.</p></div>
              <button onClick={() => setPolicyBrowser(true)} className="policy-browse-button ml-auto">Explore policies →</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
