'use client';

import { useCityPulseStore, selectFeaturedResident } from '@/lib/store';
import { AgentGroup, IncomeGroup } from '@/lib/types';
import Avatar from '../ui/Avatar';

// ------ Sentiment Bar Row -----------------------------------

interface SentimentRowProps {
  group: AgentGroup;
  onClick: () => void;
}

function SentimentRow({ group, onClick }: SentimentRowProps) {
  const score = group.currentSentiment;
  const barClass = score < 50 ? 'bar-low' : score < 70 ? 'bar-mid' : 'bar-high';
  const mood = score < 45 ? '😟' : score < 65 ? '😐' : score < 80 ? '🙂' : '😄';

  return (
    <div
      className="flex items-start gap-2.5 py-2 cursor-pointer hover:opacity-90 transition-opacity"
      onClick={onClick}
    >
      {/* Avatar portrait */}
      <Avatar
        initials={group.label.substring(0, 2).toUpperCase()}
        color={group.avatarColor}
        size={36}
      />

      <div className="flex-1 min-w-0">
        {/* Name + mood */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold" style={{ color: '#F0F4FA' }}>
            {group.label}
          </span>
          <span className="text-xs">{mood}</span>
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-1.5">
          <div
            className="flex-1 rounded-full overflow-hidden"
            style={{ height: 6, background: '#0A1628' }}
          >
            <div
              className={barClass}
              style={{
                width: `${score}%`,
                height: '100%',
                borderRadius: 3,
                transition: 'width 0.8s ease',
              }}
            />
          </div>
          <span className="text-xs font-bold flex-shrink-0" style={{ color: '#F0F4FA', minWidth: 20 }}>
            {score}
          </span>
        </div>
        {/* Quote */}
        <div className="text-xs italic mt-1 leading-tight" style={{ color: '#64748B' }}>
          {group.currentQuote}
        </div>
      </div>
    </div>
  );
}

// ------ Featured Resident Card --------------------------------

function FeaturedResidentCard() {
  const resident = useCityPulseStore(selectFeaturedResident);
  const selectResident = useCityPulseStore(s => s.selectResident);

  if (!resident) return null;

  const moodColors: Record<string, string> = {
    hopeful: '#22C55E', content: '#3B82F6', neutral: '#EAB308',
    frustrated: '#F97316', angry: '#EF4444',
  };
  const moodColor = moodColors[resident.mood] ?? '#64748B';

  const neighborhood = resident.neighborhood.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div
      className="rounded-xl p-3 cursor-pointer hover:opacity-90 transition-opacity"
      style={{ background: '#0D1E30', border: '1px solid #1E3050' }}
      onClick={() => selectResident(resident.id)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <PersonIcon />
          <span className="text-xs font-bold" style={{ color: '#94A3B8' }}>Featured Resident</span>
        </div>
        <button className="text-xs" style={{ color: '#64748B' }} title="Options">•••</button>
      </div>

      {/* Resident info */}
      <div className="flex items-start gap-2.5">
        <Avatar
          initials={resident.portraitInitials}
          color={resident.portraitColor}
          size={48}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold leading-tight" style={{ color: '#F0F4FA' }}>
            {resident.name}
          </div>
          <div className="text-xs" style={{ color: '#64748B' }}>
            {resident.occupation.split('(')[0].trim()}
          </div>
          <span
            className="badge mt-1"
            style={{
              background: `${moodColor}22`,
              color: moodColor,
              border: `1px solid ${moodColor}44`,
            }}
          >
            {resident.mood.charAt(0).toUpperCase() + resident.mood.slice(1)}
          </span>
        </div>
      </div>

      {/* Key-value rows */}
      <div className="mt-2.5 space-y-1.5">
        <InfoRow icon="🏠" label="Neighborhood" value={neighborhood} />
        <InfoRow
          icon="💰"
          label="Income"
          value={`$${resident.annualIncome.toLocaleString()}`}
          gold
        />
        <InfoRow
          icon="🚌"
          label="Commute"
          value={`${resident.commuteMins} min (${resident.commuteMode.charAt(0).toUpperCase() + resident.commuteMode.slice(1)})`}
        />
        <InfoRow
          icon="💬"
          label="Opinion"
          value={`"${resident.currentQuote}"`}
          italic
        />
      </div>
    </div>
  );
}

interface InfoRowProps {
  icon: string;
  label: string;
  value: string;
  gold?: boolean;
  italic?: boolean;
}
function InfoRow({ icon, label, value, gold, italic }: InfoRowProps) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-sm flex-shrink-0 w-4">{icon}</span>
      <span className="text-xs flex-shrink-0" style={{ color: '#64748B', minWidth: 68 }}>{label}</span>
      <span
        className={`text-xs leading-tight ${italic ? 'italic' : ''}`}
        style={{ color: gold ? '#FFB81C' : '#F0F4FA' }}
      >
        {value}
      </span>
    </div>
  );
}

// ------ Icons -----------------------------------------------
const PersonIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <circle cx="6" cy="4" r="2.5" fill="#3B82F6"/>
    <path d="M1 11c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
  </svg>
);

// ------ Decorative Tagline -----------------------------------

function TaglineDecor() {
  return (
    <div
      className="rounded-xl p-3 text-center relative overflow-hidden"
      style={{ background: '#0D1E30', border: '1px solid #1E3050' }}
    >
      {/* City silhouette SVG */}
      <svg
        width="100%" height="40"
        viewBox="0 0 280 40"
        preserveAspectRatio="xMidYMax meet"
        className="absolute bottom-0 left-0 opacity-10"
      >
        <path
          d="M0 40L0 28L20 28L20 20L30 20L30 10L40 10L40 6L50 6L50 16L60 16L60 22L70 22L70 18L75 18L75 12L82 12L82 18L90 18L90 25L100 25L100 15L108 15L108 8L115 8L115 15L125 15L125 22L135 22L135 28L145 28L145 20L155 20L155 12L162 12L162 6L170 6L170 12L178 12L178 20L188 20L188 28L200 28L200 22L210 22L210 28L220 28L220 20L230 20L230 28L240 28L240 34L250 34L250 28L260 28L260 34L280 34L280 40Z"
          fill="#FFB81C"
        />
      </svg>
      <p
        className="text-sm leading-snug relative z-10"
        style={{
          color: '#94A3B8',
          fontFamily: 'Georgia, serif',
          fontStyle: 'italic',
        }}
      >
        A kinder, smarter city.
        <br />
        <span style={{ color: '#FFB81C', fontWeight: 700 }}>Together.</span>
      </p>
    </div>
  );
}

// ------ RightSidebar -----------------------------------------

export default function RightSidebar() {
  const agentGroups = useCityPulseStore(s => s.agentGroups);
  const selectResident = useCityPulseStore(s => s.selectResident);
  const residents = useCityPulseStore(s => s.residents);

  // Map group to a representative resident for click-through
  const groupResidentId = (incomeGroup: string) => {
    const r = residents.find(res => res.incomeGroup === incomeGroup);
    return r?.id ?? null;
  };

  return (
    <div
      className="flex flex-col gap-3 p-3 flex-shrink-0 overflow-y-auto"
      style={{
        width: 320,
        background: '#0A1628',
        borderLeft: '1px solid #1E3050',
      }}
    >
      {/* === RESIDENT SENTIMENT CARD === */}
      <div className="rounded-xl p-3" style={{ background: '#162236', border: '1px solid #1E3050' }}>
        {/* Card header */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <GroupIcon />
            <span className="text-sm font-bold" style={{ color: '#F0F4FA' }}>Resident Sentiment</span>
          </div>
          <button className="text-xs" style={{ color: '#64748B' }} title="Info">ⓘ</button>
        </div>

        {/* Three income groups */}
        <div className="divide-y" style={{ borderColor: '#1E3050' }}>
          {agentGroups.map(group => (
            <SentimentRow
              key={group.id}
              group={group}
              onClick={() => {
                const rid = groupResidentId(group.incomeGroup);
                if (rid) selectResident(rid);
              }}
            />
          ))}
        </div>
      </div>

      {/* === FEATURED RESIDENT CARD === */}
      <FeaturedResidentCard />

      {/* === DECORATIVE TAGLINE === */}
      <div className="mt-auto">
        <TaglineDecor />
      </div>
    </div>
  );
}

// ------ Icons -----------------------------------------------
const GroupIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="5" cy="4.5" r="2" fill="#3B82F6"/>
    <path d="M1 12c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    <circle cx="10" cy="4.5" r="1.5" fill="#3B82F6" opacity="0.6"/>
    <path d="M8.5 12c0-1.2 0.7-2.2 1.5-2.8" stroke="#3B82F6" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
  </svg>
);
