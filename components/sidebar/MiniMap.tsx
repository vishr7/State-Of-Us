'use client';

import { useCityPulseStore } from '@/lib/store';

// ------ MiniMap Component ------------------------------------
// Shows a miniature version of the Pittsburgh map with:
// - Simplified river shapes (three rivers)
// - Neighborhood color dots
// - White viewport rectangle
// - N compass marker

export default function MiniMap() {
  const viewport = useCityPulseStore(s => s.ui.mapViewport);
  const neighborhoods = useCityPulseStore(s => s.neighborhoods);
  const selectNeighborhood = useCityPulseStore(s => s.selectNeighborhood);

  // Minimap is 176x120 pixels (inside a 184px container)
  const W = 176;
  const H = 120;

  return (
    <div
      className="rounded-xl overflow-hidden flex-shrink-0"
      style={{ background: '#0D2035', border: '1px solid #1E3050' }}
    >
      {/* Label */}
      <div className="px-2 py-1.5 text-xs font-medium" style={{ color: '#64748B' }}>
        City Overview
      </div>
      {/* SVG minimap */}
      <div className="relative" style={{ height: H }}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block mx-auto"
        >
          {/* Background */}
          <rect width={W} height={H} fill="#0D1E30"/>

          {/* --- RIVERS (simplified Three Rivers geography) --- */}
          {/* Monongahela — enters from southeast, flows west */}
          <path
            d="M176 95 Q140 90 110 88 Q90 86 72 78"
            stroke="#1B4E8A" strokeWidth="5" fill="none" strokeLinecap="round"
          />
          {/* Allegheny — enters from northeast, flows southwest */}
          <path
            d="M176 40 Q150 45 130 52 Q110 58 88 65 Q78 70 72 78"
            stroke="#1B4E8A" strokeWidth="5" fill="none" strokeLinecap="round"
          />
          {/* Ohio — flows west from the Point */}
          <path
            d="M72 78 Q55 76 38 73 Q20 70 0 68"
            stroke="#1B4E8A" strokeWidth="6" fill="none" strokeLinecap="round"
          />
          {/* Confluence fill at the Point */}
          <circle cx="72" cy="78" r="5" fill="#1B4E8A"/>

          {/* --- GOLDEN TRIANGLE (downtown) --- */}
          <polygon
            points="72,78 90,66 88,86"
            fill="#243A58" stroke="#FFB81C" strokeWidth="0.8"
          />
          {/* Downtown skyscrapers */}
          <rect x="78" y="68" width="3" height="6" fill="#3B5F8A" rx="0.5"/>
          <rect x="82" y="66" width="2" height="8" fill="#4B6FA0" rx="0.5"/>

          {/* --- BRIDGES (Three Sisters in gold) --- */}
          {/* Allegheny bridges */}
          <line x1="88" y1="62" x2="88" y2="74" stroke="#FFB81C" strokeWidth="2"/>
          <line x1="92" y1="60" x2="92" y2="72" stroke="#FFB81C" strokeWidth="2"/>
          <line x1="96" y1="58" x2="96" y2="70" stroke="#FFB81C" strokeWidth="2"/>
          {/* Mon bridges */}
          <line x1="76" y1="78" x2="76" y2="92" stroke="#94A3B8" strokeWidth="1.5"/>
          <line x1="70" y1="78" x2="70" y2="93" stroke="#94A3B8" strokeWidth="1.5"/>

          {/* --- MT WASHINGTON (south bluff) --- */}
          <path
            d="M55 92 Q65 88 78 88 Q85 88 90 90"
            fill="none" stroke="#2D4A65" strokeWidth="3"
          />
          {/* Incline line */}
          <line x1="70" y1="88" x2="64" y2="97" stroke="#FFB81C" strokeWidth="1.2"/>

          {/* --- NEIGHBORHOOD DOTS --- */}
          {neighborhoods.map(n => {
            const x = n.mapX * W;
            const y = n.mapY * H;
            const color = n.incomeGroup === 'higher' ? '#FFB81C'
              : n.incomeGroup === 'middle' ? '#3B82F6'
              : '#EF4444';
            return (
              <g key={n.id}>
                <circle
                  cx={x} cy={y} r={4}
                  fill={color} opacity={0.85}
                  style={{ cursor: 'pointer' }}
                  onClick={() => selectNeighborhood(n.id)}
                />
                <circle cx={x} cy={y} r={6} fill={color} opacity={0.15}/>
              </g>
            );
          })}

          {/* --- VIEWPORT RECTANGLE --- */}
          <rect
            x={W * 0.15}
            y={H * 0.10}
            width={W * 0.70}
            height={H * 0.80}
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            opacity={0.5}
          />

          {/* --- NORTH COMPASS --- */}
          <g transform={`translate(${W - 16}, 10)`}>
            <circle cx="0" cy="0" r="7" fill="#162236" stroke="#243A58" strokeWidth="1"/>
            <text x="0" y="4" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#FFB81C">N</text>
          </g>
        </svg>
      </div>
    </div>
  );
}
