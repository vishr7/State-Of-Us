'use client';

import { useState } from 'react';
import { useCityPulseStore } from '@/lib/store';
import { getAgentReasoning } from '@/lib/mockAgents';
import Avatar from '../ui/Avatar';

// ============================================================
// TownHallModal — resident dialogue + ElevenLabs placeholder
// ============================================================

export default function TownHallModal() {
  const setTownHall = useCityPulseStore(s => s.setTownHall);
  const residents = useCityPulseStore(s => s.residents);
  const policies = useCityPulseStore(s => s.policies);
  const city = useCityPulseStore(s => s.city);
  const [activeResidentId, setActiveResidentId] = useState(residents[0]?.id ?? '');
  const [speakerPlaying, setSpeakerPlaying] = useState<string | null>(null);

  const activeResident = residents.find(r => r.id === activeResidentId) ?? residents[0];

  // Get reasoning for a mix of policies for this resident
  const topPolicy = policies.find(p => p.status === 'proposed') ?? policies[0];
  const reasoning = activeResident && topPolicy
    ? getAgentReasoning(activeResident, topPolicy)
    : null;

  const moodColors: Record<string, string> = {
    hopeful: '#22C55E', content: '#3B82F6', neutral: '#EAB308',
    frustrated: '#F97316', angry: '#EF4444',
  };

  const handleSpeaker = (residentId: string) => {
    // ElevenLabs placeholder — visually wired, silent
    setSpeakerPlaying(speakerPlaying === residentId ? null : residentId);
    // In production: call ElevenLabs API with reasoning.reason as the text
    // const audio = await elevenlabs.generate({ voice: resident.archetype, text: reasoning.reason });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div
        className="rounded-2xl flex w-full max-w-3xl"
        style={{ background: '#0F1B2D', border: '1px solid #1E3050', height: '80vh' }}
      >
        {/* Left: resident list */}
        <div
          className="flex flex-col w-52 p-3 gap-1 overflow-y-auto flex-shrink-0"
          style={{ borderRight: '1px solid #1E3050' }}
        >
          <div className="text-xs font-bold px-2 py-1.5" style={{ color: '#64748B' }}>
            TOWN HALL SPEAKERS
          </div>
          {residents.map(r => {
            const isActive = r.id === activeResidentId;
            const moodColor = moodColors[r.mood] ?? '#64748B';
            return (
              <button
                key={r.id}
                onClick={() => setActiveResidentId(r.id)}
                className="flex items-center gap-2 rounded-xl p-2 text-left transition-colors"
                style={{
                  background: isActive ? '#1E2E45' : 'transparent',
                  borderLeft: isActive ? '3px solid #3B82F6' : '3px solid transparent',
                }}
              >
                <Avatar initials={r.portraitInitials} color={r.portraitColor} size={32} />
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: '#F0F4FA' }}>{r.name}</div>
                  <div className="text-xs truncate" style={{ color: moodColor }}>
                    {r.mood.charAt(0).toUpperCase() + r.mood.slice(1)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: dialogue panel */}
        <div className="flex-1 flex flex-col p-5 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-bold" style={{ color: '#64748B' }}>
                🏛️ PITTSBURGH TOWN HALL — Year {city.year}, Turn {city.turn}
              </div>
              <h2 className="text-lg font-black" style={{ color: '#F0F4FA' }}>Public Comment Session</h2>
            </div>
            <button
              onClick={() => setTownHall(false)}
              className="px-3 py-1.5 rounded-lg text-sm font-bold"
              style={{ color: '#64748B', background: '#162236' }}
            >✕</button>
          </div>

          {activeResident && (
            <>
              {/* Resident ID card */}
              <div
                className="flex items-center gap-3 rounded-xl p-4 mb-4"
                style={{ background: '#162236', border: '1px solid #1E3050' }}
              >
                <Avatar initials={activeResident.portraitInitials} color={activeResident.portraitColor} size={52} />
                <div className="flex-1">
                  <div className="text-base font-black" style={{ color: '#F0F4FA' }}>{activeResident.name}</div>
                  <div className="text-sm" style={{ color: '#64748B' }}>
                    {activeResident.occupation}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                    {activeResident.neighborhood.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} •{' '}
                    {activeResident.isHomeowner ? 'Homeowner' : 'Renter'}
                  </div>
                </div>
                {/* ElevenLabs speaker button — visually wired, silent */}
                <button
                  onClick={() => handleSpeaker(activeResident.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all"
                  style={{
                    background: speakerPlaying === activeResident.id ? '#3B82F6' : '#243A58',
                    color: speakerPlaying === activeResident.id ? 'white' : '#94A3B8',
                    border: '1px solid #1E3050',
                  }}
                  title="Text-to-speech (ElevenLabs — coming soon)"
                >
                  <SpeakerIcon playing={speakerPlaying === activeResident.id} />
                  {speakerPlaying === activeResident.id ? 'Playing...' : 'Speak'}
                </button>
              </div>

              {/* Dialogue bubble — opening statement */}
              <div
                className="rounded-xl p-4 mb-3"
                style={{ background: '#0D1E30', border: '1px solid #1E3050' }}
              >
                <div className="text-xs font-bold mb-2" style={{ color: '#64748B' }}>OPENING STATEMENT</div>
                <p className="text-sm leading-relaxed italic" style={{ color: '#F0F4FA' }}>
                  &ldquo;{activeResident.currentQuote}&rdquo;
                </p>
              </div>

              {/* Policy reaction */}
              {reasoning && topPolicy && (
                <div
                  className="rounded-xl p-4 mb-3"
                  style={{ background: '#0D1E30', border: '1px solid #1E3050' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold" style={{ color: '#64748B' }}>
                      REACTION TO: &ldquo;{topPolicy.name}&rdquo;
                    </div>
                    <span
                      className="badge"
                      style={{
                        background: reasoning.support >= 0.6 ? '#22C55E22' : '#EF444422',
                        color: reasoning.support >= 0.6 ? '#22C55E' : '#EF4444',
                      }}
                    >
                      {Math.round(reasoning.support * 100)}% Support
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed italic" style={{ color: '#94A3B8' }}>
                    &ldquo;{reasoning.reason}&rdquo;
                  </p>
                  <div className="mt-2 text-xs" style={{ color: '#64748B' }}>
                    Government trust: {reasoning.trustChange >= 0 ? '↑' : '↓'}&nbsp;
                    <span style={{ color: reasoning.trustChange >= 0 ? '#22C55E' : '#EF4444' }}>
                      {Math.abs(Math.round(reasoning.trustChange * 100))}%
                    </span>
                  </div>
                </div>
              )}

              {/* ElevenLabs note */}
              <div
                className="rounded-xl p-3 mt-auto"
                style={{ background: '#162236', border: '1px dashed #243A58' }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎙️</span>
                  <div>
                    <div className="text-xs font-bold" style={{ color: '#64748B' }}>
                      Voice Integration Placeholder
                    </div>
                    <div className="text-xs" style={{ color: '#64748B' }}>
                      The Speak button is wired for ElevenLabs text-to-speech. Set{' '}
                      <code className="px-1 rounded" style={{ background: '#0A1628', color: '#FFB81C' }}>
                        NEXT_PUBLIC_ELEVENLABS_KEY
                      </code>{' '}
                      in .env to enable audio.
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SpeakerIcon({ playing }: { playing: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 5.5H1v5h2l4 3V2.5L3 5.5Z" fill="currentColor"/>
      {playing ? (
        <>
          <path d="M10 4.5a4 4 0 010 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          <path d="M12 2.5a7 7 0 010 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5"/>
        </>
      ) : (
        <path d="M10 5.5a3 3 0 010 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      )}
    </svg>
  );
}
