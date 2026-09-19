'use client';

import { useCityPulseStore } from '@/lib/store';
import { CategoryId } from '@/lib/types';

// ------ Category definitions --------------------------------

interface CategoryDef {
  id: CategoryId;
  label: string;
  subtitle: string;
  iconBg: string;
  icon: React.ReactNode;
}

const HouseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M2 9L9 2L16 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4 7.5V15H14V7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="7" y="11" width="4" height="4" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);
const TrainIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="3" y="2" width="12" height="11" rx="3" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M3 10h12" stroke="currentColor" strokeWidth="1.5"/>
    <circle cx="6" cy="14" r="1.5" fill="currentColor"/>
    <circle cx="12" cy="14" r="1.5" fill="currentColor"/>
    <path d="M6 13l-2 3M12 13l2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M6 6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const CoinsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="11" cy="11" r="5" stroke="currentColor" strokeWidth="1.8"/>
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.8" fill="#0A1628"/>
    <text x="7" y="10.5" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor">$</text>
  </svg>
);
const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 2L3 5v5c0 3.5 2.5 6.8 6 7.5 3.5-.7 6-4 6-7.5V5L9 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const BriefcaseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="2" y="6" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M6 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M2 11h14" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);
const LeafIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M14 4C14 4 8 3 4 9c-1.5 2.2-1.5 5 0 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M4 16c2-1 6-4 10-12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

const CATEGORIES: CategoryDef[] = [
  {
    id: 'housing', label: 'Housing', subtitle: 'Homes for a stronger city',
    iconBg: '#FF7B4220', icon: <HouseIcon />,
  },
  {
    id: 'transit', label: 'Transit', subtitle: 'Connect people',
    iconBg: '#3B82F620', icon: <TrainIcon />,
  },
  {
    id: 'taxes', label: 'Taxes', subtitle: 'Fund what matters',
    iconBg: '#FFB81C20', icon: <CoinsIcon />,
  },
  {
    id: 'safety', label: 'Safety', subtitle: 'Safer neighborhoods',
    iconBg: '#3B82F620', icon: <ShieldIcon />,
  },
  {
    id: 'business', label: 'Business', subtitle: 'Jobs & opportunity',
    iconBg: '#8B5CF620', icon: <BriefcaseIcon />,
  },
  {
    id: 'environment', label: 'Environment', subtitle: 'A cleaner, greener tomorrow',
    iconBg: '#22C55E20', icon: <LeafIcon />,
  },
];

const ICON_COLORS: Record<CategoryId, string> = {
  housing: '#FF7B42',
  transit: '#3B82F6',
  taxes: '#FFB81C',
  safety: '#3B82F6',
  business: '#8B5CF6',
  environment: '#22C55E',
};

// ------ CategoryNav Component --------------------------------

export default function CategoryNav() {
  const activeId = useCityPulseStore(s => s.ui.activeCategoryId);
  const setActiveCategory = useCityPulseStore(s => s.setActiveCategory);

  return (
    <div className="flex flex-col gap-1">
      {CATEGORIES.map(cat => {
        const isActive = cat.id === activeId;
        const color = ICON_COLORS[cat.id];
        return (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all w-full"
            style={{
              background: isActive ? '#1E2E45' : 'transparent',
              borderLeft: isActive ? `3px solid #3B82F6` : '3px solid transparent',
            }}
          >
            {/* Colored square icon */}
            <div
              className="cat-icon flex-shrink-0"
              style={{ background: cat.iconBg, color }}
            >
              {cat.icon}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold leading-tight truncate" style={{ color: '#F0F4FA' }}>
                {cat.label}
              </div>
              <div className="text-xs leading-tight mt-0.5 truncate" style={{ color: '#64748B' }}>
                {cat.subtitle}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
