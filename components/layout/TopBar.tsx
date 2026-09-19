'use client';

import { useCityPulseStore } from '@/lib/store';

// ============================================================
// TopBar — full-width fixed 64px header bar
// Layout:
//   [CityPulse logo + tagline] [stat pills] [play/pause controls]
// ============================================================

// ------ Sub-components --------------------------------------

interface StatPillProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  badge?: string;
  badgeColor?: string;
}

function StatPill({ icon, iconBg, label, value, badge, badgeColor = '#22C55E' }: StatPillProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
      style={{ background: '#162236', border: '1px solid #1E3050', minWidth: 120 }}
    >
      {/* Circular icon */}
      <div
        className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-xs leading-none" style={{ color: '#64748B' }}>{label}</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-sm font-bold leading-none" style={{ color: '#F0F4FA' }}>{value}</span>
          {badge && (
            <span
              className="text-xs font-semibold px-1 rounded"
              style={{ color: badgeColor, background: `${badgeColor}22` }}
            >
              {badge}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ------ SVG Icons -------------------------------------------

const CoinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="7" fill="#FFB81C" opacity="0.9"/>
    <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#7A4F00">$</text>
  </svg>
);
const TrendUpIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <polyline points="2,12 6,7 10,9 14,4" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <polyline points="10,4 14,4 14,8" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const SmileyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="7" stroke="#EAB308" strokeWidth="1.5"/>
    <circle cx="5.5" cy="6.5" r="1" fill="#EAB308"/>
    <circle cx="10.5" cy="6.5" r="1" fill="#EAB308"/>
    <path d="M5 10 Q8 13 11 10" stroke="#EAB308" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
  </svg>
);
const StarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 2L9.8 6.2L14.5 6.6L11 9.6L12.1 14.2L8 11.8L3.9 14.2L5 9.6L1.5 6.6L6.2 6.2L8 2Z" fill="#FFB81C"/>
  </svg>
);
const PeopleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="5" cy="5" r="2.5" fill="#3B82F6"/>
    <path d="M1 13c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    <circle cx="11" cy="5" r="2" fill="#3B82F6" opacity="0.7"/>
    <path d="M9 13c0-1.5 0.9-2.8 2-3.5" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
  </svg>
);
const PauseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="2" y="2" width="3.5" height="10" rx="1" fill="currentColor"/>
    <rect x="8.5" y="2" width="3.5" height="10" rx="1" fill="currentColor"/>
  </svg>
);
const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 2L12 7L3 12V2Z" fill="currentColor"/>
  </svg>
);
const GearIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="2.5" stroke="#64748B" strokeWidth="1.5"/>
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ------ Main TopBar Component --------------------------------

export default function TopBar() {
  const city = useCityPulseStore(s => s.city);
  const isPlaying = useCityPulseStore(s => s.ui.isPlaying);
  const startPlaying = useCityPulseStore(s => s.startPlaying);
  const stopPlaying = useCityPulseStore(s => s.stopPlaying);
  const setAnalytics = useCityPulseStore(s => s.setAnalytics);
  const lastSnapshot = useCityPulseStore(s => s.lastSnapshot);

  // Compute deltas vs. last snapshot
  const prevCity = lastSnapshot ?? null;
  const revenueChange = prevCity ? city.revenue - prevCity.revenue : null;
  const happinessDelta = prevCity ? city.happiness - prevCity.happiness : 4;
  const approvalDelta = prevCity ? city.approval - prevCity.approval : 6;
  const populationDelta = prevCity ? city.population - prevCity.population : 320;

  const fmtCurrency = (n: number) => `$${n.toLocaleString()}`;

  const signedBadge = (v: number | null, prefix = '', suffix = '') => {
    if (v === null || v === undefined) return undefined;
    return `${v > 0 ? '+' : ''}${prefix}${v}${suffix}`;
  };

  const badgeColor = (v: number | null) => (v === null || v >= 0 ? '#22C55E' : '#EF4444');

  return (
    <div
      className="flex items-center gap-3 px-4 flex-shrink-0"
      style={{
        height: 64,
        background: '#0A1628',
        borderBottom: '1px solid #1E3050',
        zIndex: 50,
      }}
    >
      {/* === LOGO === */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Pixel city icon */}
        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0" style={{ background: '#1E2E45' }}>
          <CityPixelIcon />
        </div>
        <div>
          <div className="text-base font-black tracking-tight leading-none">
            <span className="text-white">City</span>
            <span style={{ color: '#FFB81C' }}>Pulse</span>
          </div>
          <div className="text-xs leading-none mt-0.5" style={{ color: '#64748B' }}>
            People. Policies. A Brighter Tomorrow.
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* === STAT PILLS === */}
      <div className="flex items-center gap-2">
        <StatPill
          icon={<CoinIcon />}
          iconBg="#7A4F0030"
          label="Budget"
          value={fmtCurrency(city.treasury)}
        />
        <StatPill
          icon={<TrendUpIcon />}
          iconBg="#22C55E20"
          label="Revenue"
          value={fmtCurrency(city.revenue)}
          badge={prevCity ? signedBadge(revenueChange, '$') : '+17%'}
          badgeColor="#22C55E"
        />
        <StatPill
          icon={<SmileyIcon />}
          iconBg="#EAB30820"
          label="Happiness"
          value={String(city.happiness)}
          badge={signedBadge(happinessDelta)}
          badgeColor={badgeColor(happinessDelta)}
        />
        <StatPill
          icon={<StarIcon />}
          iconBg="#FFB81C20"
          label="Approval"
          value={`${city.approval}%`}
          badge={signedBadge(approvalDelta, '', '%')}
          badgeColor={badgeColor(approvalDelta)}
        />
        <StatPill
          icon={<PeopleIcon />}
          iconBg="#3B82F620"
          label="Population"
          value={city.population.toLocaleString()}
          badge={signedBadge(populationDelta)}
          badgeColor={badgeColor(populationDelta)}
        />
      </div>

      {/* === PLAY / PAUSE CONTROLS === */}
      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
        <div
          className="flex items-center rounded-xl overflow-hidden"
          style={{ border: '1px solid #1E3050', background: '#162236' }}
        >
          {/* Pause */}
          <button
            onClick={stopPlaying}
            className="flex items-center justify-center w-9 h-9 transition-colors"
            style={{ color: isPlaying ? '#64748B' : '#F0F4FA', background: isPlaying ? 'transparent' : '#1E3050' }}
            title="Pause"
          >
            <PauseIcon />
          </button>
          {/* Play */}
          <button
            onClick={startPlaying}
            className="flex items-center justify-center w-9 h-9 transition-colors"
            style={{ color: isPlaying ? '#F0F4FA' : '#64748B', background: isPlaying ? '#3B82F6' : 'transparent' }}
            title="Play"
          >
            <PlayIcon />
          </button>
        </div>
        {/* Settings / Analytics */}
        <button
          onClick={() => setAnalytics(true)}
          className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
          style={{ background: '#162236', border: '1px solid #1E3050' }}
          title="Analytics"
        >
          <GearIcon />
        </button>
      </div>
    </div>
  );
}

// ------ Small pixel-art city icon (SVG) ---------------------

function CityPixelIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      {/* Sky */}
      <rect width="32" height="32" fill="#0F1B2D"/>
      {/* Buildings */}
      <rect x="2" y="14" width="5" height="14" fill="#FFB81C"/>
      <rect x="3" y="10" width="3" height="4" fill="#FFD166"/>
      <rect x="8" y="8" width="7" height="20" fill="#3B82F6"/>
      <rect x="9" y="4" width="5" height="4" fill="#60A5FA"/>
      <rect x="16" y="12" width="6" height="16" fill="#FFB81C"/>
      <rect x="23" y="16" width="5" height="12" fill="#2563EB"/>
      <rect x="24" y="12" width="3" height="4" fill="#3B82F6"/>
      {/* Windows */}
      <rect x="9" y="10" width="1" height="1" fill="#FFB81C"/>
      <rect x="12" y="10" width="1" height="1" fill="#FFB81C"/>
      <rect x="9" y="14" width="1" height="1" fill="#FFB81C"/>
      <rect x="12" y="14" width="1" height="1" fill="#FFB81C"/>
      {/* River */}
      <rect x="0" y="28" width="32" height="4" fill="#1E3A5F"/>
    </svg>
  );
}
