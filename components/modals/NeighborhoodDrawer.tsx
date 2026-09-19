'use client';

import { useCityPulseStore, selectActiveNeighborhood } from '@/lib/store';

// ============================================================
// NeighborhoodDrawer — slide-in panel when a zone is clicked
// ============================================================

export default function NeighborhoodDrawer() {
  const neighborhood = useCityPulseStore(selectActiveNeighborhood);
  const selectNeighborhood = useCityPulseStore(s => s.selectNeighborhood);
  const residents = useCityPulseStore(s => s.residents);
  const selectResident = useCityPulseStore(s => s.selectResident);

  if (!neighborhood) return null;

  const localResidents = residents.filter(r => r.neighborhood === neighborhood.id);
  const score = neighborhood.happiness;
  const barColor = score < 50 ? '#EF4444' : score < 70 ? '#EAB308' : '#22C55E';

  const tierColors: Record<string, string> = {
    higher: '#FFB81C', middle: '#3B82F6', lower: '#EF4444',
  };
  const tierColor = tierColors[neighborhood.incomeGroup] ?? '#94A3B8';

  const pct = (v: number, max = 100) => Math.min(100, Math.round(v * 100 / max));

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={() => selectNeighborhood(null)}
      />
      {/* Drawer */}
      <div
        className="drawer-enter fixed top-16 right-0 bottom-0 z-50 overflow-y-auto p-4 flex flex-col gap-3"
        style={{ width: 360, background: '#0A1628', borderLeft: '1px solid #1E3050' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="badge text-sm"
                style={{ background: `${tierColor}22`, color: tierColor, border: `1px solid ${tierColor}44` }}
              >
                {neighborhood.incomeGroup.charAt(0).toUpperCase() + neighborhood.incomeGroup.slice(1)} Income
              </span>
            </div>
            <h2 className="text-xl font-black mt-1" style={{ color: '#F0F4FA' }}>
              {neighborhood.name}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
              {neighborhood.historicalNote}
            </p>
          </div>
          <button
            onClick={() => selectNeighborhood(null)}
            className="text-lg px-2 py-1 rounded-lg"
            style={{ color: '#64748B', background: '#162236' }}
          >
            ✕
          </button>
        </div>

        {/* Key Stats */}
        <div className="rounded-xl p-3" style={{ background: '#162236', border: '1px solid #1E3050' }}>
          <h3 className="text-xs font-bold mb-2.5" style={{ color: '#94A3B8' }}>KEY STATISTICS</h3>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
            <StatRow label="Population" value={neighborhood.population.toLocaleString()} />
            <StatRow label="Median Income" value={`$${neighborhood.medianIncome.toLocaleString()}`} gold />
            <StatRow label="Avg Rent" value={`$${neighborhood.averageRent}/mo`} />
            <StatRow label="Vacancy Rate" value={`${Math.round(neighborhood.vacancyRate * 100)}%`}
              warn={neighborhood.vacancyRate > 0.15} />
            <StatRow label="Renter Fraction" value={`${Math.round(neighborhood.renterFraction * 100)}%`} />
            <StatRow label="Transit Access" value={`${neighborhood.transitAccess}/100`} />
            <StatRow label="Safety Score" value={`${neighborhood.safetyScore}/100`} />
            <StatRow label="Hillside Risk" value={`${Math.round(neighborhood.hillsideRisk * 100)}%`}
              warn={neighborhood.hillsideRisk > 0.2} />
          </div>
        </div>

        {/* Happiness + Bars */}
        <div className="rounded-xl p-3" style={{ background: '#162236', border: '1px solid #1E3050' }}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold" style={{ color: '#94A3B8' }}>NEIGHBORHOOD HEALTH</h3>
            <span className="text-lg font-black" style={{ color: barColor }}>{score}</span>
          </div>
          <BarRow label="Happiness" value={score} max={100} color={barColor} />
          <BarRow label="Transit" value={neighborhood.transitAccess} max={100} color="#3B82F6" />
          <BarRow label="Safety" value={neighborhood.safetyScore} max={100} color="#22C55E" />
          <BarRow label="Gentrification" value={Math.round(neighborhood.gentrificationPressure * 100)} max={100} color="#EF4444" />
        </div>

        {/* Pittsburgh context */}
        <div className="rounded-xl p-3" style={{ background: '#0D1E30', border: '1px solid #1E3050' }}>
          <h3 className="text-xs font-bold mb-1.5" style={{ color: '#94A3B8' }}>ABOUT THIS NEIGHBORHOOD</h3>
          <p className="text-xs leading-relaxed" style={{ color: '#94A3B8' }}>
            {neighborhood.description}
          </p>
        </div>

        {/* Local residents */}
        {localResidents.length > 0 && (
          <div className="rounded-xl p-3" style={{ background: '#162236', border: '1px solid #1E3050' }}>
            <h3 className="text-xs font-bold mb-2" style={{ color: '#94A3B8' }}>LOCAL RESIDENTS</h3>
            {localResidents.map(r => (
              <button
                key={r.id}
                onClick={() => { selectResident(r.id); selectNeighborhood(null); }}
                className="flex items-center gap-2 w-full rounded-lg p-2 text-left hover:opacity-80 transition-opacity"
                style={{ background: '#0D1E30' }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: `${r.portraitColor}33`, color: r.portraitColor }}
                >
                  {r.portraitInitials}
                </div>
                <div>
                  <div className="text-xs font-bold" style={{ color: '#F0F4FA' }}>{r.name}</div>
                  <div className="text-xs" style={{ color: '#64748B' }}>{r.occupation.split('(')[0].trim()}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function StatRow({ label, value, gold, warn }: { label: string; value: string; gold?: boolean; warn?: boolean }) {
  return (
    <div>
      <div className="text-xs" style={{ color: '#64748B' }}>{label}</div>
      <div className="text-xs font-bold" style={{ color: warn ? '#EF4444' : gold ? '#FFB81C' : '#F0F4FA' }}>{value}</div>
    </div>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="mb-1.5">
      <div className="flex justify-between mb-0.5">
        <span className="text-xs" style={{ color: '#64748B' }}>{label}</span>
        <span className="text-xs font-bold" style={{ color }}>{value}</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 4, background: '#0A1628' }}>
        <div style={{ width: `${(value / max) * 100}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}
