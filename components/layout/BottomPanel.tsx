'use client';

import { useCityPulseStore } from '@/lib/store';
import { Policy } from '@/lib/types';
import PolicyCard from '../ui/PolicyCard';

// ============================================================
// BottomPanel — full-width proposed policies strip
// ============================================================

export default function BottomPanel() {
  const activeCategoryId = useCityPulseStore(s => s.ui.activeCategoryId);
  const policies = useCityPulseStore(s => s.policies);
  const setPolicyBrowser = useCityPulseStore(s => s.setPolicyBrowser);

  // Show proposed policies for the active category (first 3)
  const proposed = policies.filter(
    p => p.status === 'proposed' && p.category === activeCategoryId
  ).slice(0, 3);

  // Fall back to any proposed if none for this category
  const displayed = proposed.length > 0
    ? proposed
    : policies.filter(p => p.status === 'proposed').slice(0, 3);

  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{
        height: 150,
        background: '#0A1628',
        borderTop: '1px solid #1E3050',
        padding: '8px 12px 8px',
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <DocIcon />
        <span className="text-sm font-bold" style={{ color: '#F0F4FA' }}>
          Proposed Policies
        </span>
        <span className="text-xs ml-1" style={{ color: '#64748B' }}>
          Choose a policy to shape your city. Each decision affects your budget, residents, and the future.
        </span>
        <div className="ml-auto flex-shrink-0">
          <button
            onClick={() => setPolicyBrowser(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{
              color: '#3B82F6',
              background: '#3B82F620',
              border: '1px solid #3B82F640',
            }}
          >
            See All Policies →
          </button>
        </div>
      </div>

      {/* Policy cards row */}
      <div
        className="flex gap-2 overflow-x-auto flex-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {displayed.length === 0 ? (
          <div
            className="flex items-center justify-center flex-1 rounded-xl text-sm"
            style={{ background: '#162236', border: '1px solid #1E3050', color: '#64748B' }}
          >
            All policies in this category have been enacted.
          </div>
        ) : (
          displayed.map(policy => (
            <PolicyCard key={policy.id} policy={policy} />
          ))
        )}
      </div>
    </div>
  );
}

// ------ Icons -----------------------------------------------
const DocIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="1" width="10" height="14" rx="1.5" stroke="#64748B" strokeWidth="1.5"/>
    <path d="M5 5h6M5 8h6M5 11h4" stroke="#64748B" strokeWidth="1.2" strokeLinecap="round"/>
    <rect x="9" y="9" width="5" height="6" rx="1" fill="#3B82F6" stroke="#3B82F6" strokeWidth="0"/>
    <path d="M11 11l1 1-1 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
