'use client';

import { useCityPulseStore } from '@/lib/store';

// ============================================================
// TopBar — full-width fixed 64px header bar
// Layout:
//   [State of US logo + tagline] [stat pills] [play/pause controls]
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
      {/* === BRAND === */}
      <div className="state-brand" aria-label="State of US — Your city. Our tomorrow.">
        <div className="state-brand-emblem" aria-hidden="true"><CityPixelIcon /></div>
        <div className="state-brand-copy">
          <div className="state-brand-wordmark"><span>State</span><span className="state-brand-of">of</span><span className="state-brand-us">US<span className="state-brand-period">.</span></span></div>
          <div className="state-brand-tagline"><span className="state-brand-line" aria-hidden="true" />Your city. Our tomorrow.</div>
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
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 3 43 14v20L24 45 5 34V14L24 3Z" fill="#12273a" stroke="#53707e" strokeWidth="0.8" />
      <path d="m24 8 14 8v16l-14 8-14-8V16l14-8Z" stroke="#a5bcc9" strokeOpacity="0.12" />
      <path d="m13 21 6-3v15l-6-3V21Z" fill="#e4aa50" />
      <path d="m19 13 7-4v28l-7-4V13Z" fill="#f8d58d" />
      <path d="m26 9 5 3v22l-5 3V9Z" fill="#cb9041" />
      <path d="m31 21 5-3v13l-5 3V21Z" fill="#7ba9be" />
      <path d="m36 18 3 2v9l-3 2V18Z" fill="#426a80" />
      <path d="m21 16 3-1.5m-3 6 3-1.5m-3 6 3-1.5" stroke="#203648" strokeWidth="1.5" />
      <path d="m11 35 13 7 15-9" stroke="#f1c77a" strokeWidth="1.2" strokeLinecap="round" />
      <path d="m35 9 .8 2.2L38 12l-2.2.8L35 15l-.8-2.2L32 12l2.2-.8L35 9Z" fill="#ffe4ae" />
    </svg>
  );
}
