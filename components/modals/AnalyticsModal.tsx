'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';
import { useCityPulseStore } from '@/lib/store';

// ============================================================
// AnalyticsModal — Recharts line graphs + equity chart
// ============================================================

export default function AnalyticsModal() {
  const setAnalytics = useCityPulseStore(s => s.setAnalytics);
  const snapshots = useCityPulseStore(s => s.snapshots);
  const neighborhoods = useCityPulseStore(s => s.neighborhoods);

  // Format snapshots for Recharts
  const timeData = snapshots.map(s => ({
    turn: `T${s.turn}`,
    Happiness: s.happiness,
    Approval: s.approval,
    Revenue: Math.round(s.revenue / 1000),      // $K
    Expenses: Math.round(s.expenses / 1000),     // $K
    Rent: s.averageRent,
    Population: Math.round(s.population / 1000), // K
  }));

  // Neighborhood equity comparison
  const equityData = neighborhoods.slice(0, 8).map(n => ({
    name: n.name.split(' ')[0],   // first word only for brevity
    Happiness: n.happiness,
    Transit: n.transitAccess,
    Safety: n.safetyScore,
    Rent: Math.round(n.averageRent / 10), // scaled
  }));

  const COLORS = {
    Happiness: '#22C55E',
    Approval: '#3B82F6',
    Revenue: '#FFB81C',
    Expenses: '#EF4444',
    Rent: '#8B5CF6',
    Population: '#06B6D4',
  };

  const tooltipStyle = {
    backgroundColor: '#162236',
    border: '1px solid #1E3050',
    borderRadius: 8,
    color: '#F0F4FA',
    fontSize: 12,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div
        className="rounded-2xl flex flex-col w-full max-w-4xl"
        style={{ background: '#0F1B2D', border: '1px solid #1E3050', height: '85vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid #1E3050' }}
        >
          <div>
            <h2 className="text-lg font-black" style={{ color: '#F0F4FA' }}>City Analytics</h2>
            <p className="text-xs" style={{ color: '#64748B' }}>
              {snapshots.length} turn{snapshots.length !== 1 ? 's' : ''} of data • Pittsburgh, PA
            </p>
          </div>
          <button
            onClick={() => setAnalytics(false)}
            className="px-3 py-1.5 rounded-lg text-sm font-bold"
            style={{ color: '#64748B', background: '#162236' }}
          >✕ Close</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Sentiment & Approval over time */}
          <ChartCard title="Happiness & Approval Over Time" subtitle="City-wide scores by turn">
            {timeData.length < 2 ? (
              <NoDataMessage />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={timeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E3050"/>
                  <XAxis dataKey="turn" stroke="#64748B" fontSize={11}/>
                  <YAxis domain={[0, 100]} stroke="#64748B" fontSize={11}/>
                  <Tooltip contentStyle={tooltipStyle}/>
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}/>
                  <Line type="monotone" dataKey="Happiness" stroke={COLORS.Happiness} strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="Approval" stroke={COLORS.Approval} strokeWidth={2} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Budget over time */}
          <ChartCard title="Budget — Revenue vs Expenses ($K)" subtitle="Per-turn financial health">
            {timeData.length < 2 ? (
              <NoDataMessage />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={timeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E3050"/>
                  <XAxis dataKey="turn" stroke="#64748B" fontSize={11}/>
                  <YAxis stroke="#64748B" fontSize={11}/>
                  <Tooltip contentStyle={tooltipStyle}/>
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}/>
                  <Line type="monotone" dataKey="Revenue" stroke={COLORS.Revenue} strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="Expenses" stroke={COLORS.Expenses} strokeWidth={2} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Average rent over time */}
          <ChartCard title="Average Rent ($/month)" subtitle="City-wide housing affordability trend">
            {timeData.length < 2 ? (
              <NoDataMessage />
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={timeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E3050"/>
                  <XAxis dataKey="turn" stroke="#64748B" fontSize={11}/>
                  <YAxis stroke="#64748B" fontSize={11}/>
                  <Tooltip contentStyle={tooltipStyle}/>
                  <Line type="monotone" dataKey="Rent" stroke={COLORS.Rent} strokeWidth={2} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Neighborhood equity comparison */}
          <ChartCard title="Neighborhood Equity Comparison" subtitle="Happiness, Transit, and Safety by neighborhood">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={equityData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E3050"/>
                <XAxis dataKey="name" stroke="#64748B" fontSize={10}/>
                <YAxis domain={[0, 100]} stroke="#64748B" fontSize={11}/>
                <Tooltip contentStyle={tooltipStyle}/>
                <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}/>
                <Bar dataKey="Happiness" fill={COLORS.Happiness} radius={[2, 2, 0, 0]}/>
                <Bar dataKey="Transit" fill={COLORS.Approval} radius={[2, 2, 0, 0]}/>
                <Bar dataKey="Safety" fill="#F97316" radius={[2, 2, 0, 0]}/>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#162236', border: '1px solid #1E3050' }}>
      <h3 className="text-sm font-bold mb-0.5" style={{ color: '#F0F4FA' }}>{title}</h3>
      <p className="text-xs mb-3" style={{ color: '#64748B' }}>{subtitle}</p>
      {children}
    </div>
  );
}

function NoDataMessage() {
  return (
    <div className="flex items-center justify-center h-32 text-sm" style={{ color: '#64748B' }}>
      Press Play to advance turns and generate chart data.
    </div>
  );
}
