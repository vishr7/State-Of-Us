'use client';

// ============================================================
// MapSkeleton — shown while the PixiJS canvas loads.
// Shimmer effect on a Pittsburgh-themed placeholder.
// ============================================================

export default function MapSkeleton() {
  return (
    <div
      className="w-full h-full flex items-center justify-center relative overflow-hidden"
      style={{ background: '#0D1E30' }}
    >
      {/* Shimmer overlay */}
      <div className="absolute inset-0 skeleton-shimmer opacity-50" />

      {/* Simplified SVG map placeholder */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 800 500"
        preserveAspectRatio="xMidYMid slice"
        className="opacity-20"
      >
        {/* Rivers */}
        <path d="M800 160 Q600 180 480 250 Q420 280 360 290" stroke="#1B4E8A" strokeWidth="20" fill="none"/>
        <path d="M800 380 Q640 360 520 340 Q450 330 360 290" stroke="#1B4E8A" strokeWidth="20" fill="none"/>
        <path d="M360 290 Q260 280 140 270 Q60 265 0 260" stroke="#1B4E8A" strokeWidth="25" fill="none"/>
        {/* Downtown triangle */}
        <polygon points="360,290 420,240 410,320" fill="#243A58"/>
        {/* Buildings */}
        <rect x="370" y="245" width="12" height="30" fill="#3B5F8A"/>
        <rect x="385" y="240" width="8" height="35" fill="#4B6FA0"/>
        <rect x="395" y="248" width="10" height="28" fill="#3B5F8A"/>
      </svg>

      {/* Loading text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div
          className="text-2xl font-black"
          style={{ color: '#FFB81C', fontFamily: 'Georgia, serif' }}
        >
          Pittsburgh
        </div>
        <div className="text-sm" style={{ color: '#64748B' }}>
          Loading city map…
        </div>
        <div className="flex gap-1 mt-2">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full pulse-dot"
              style={{
                background: '#FFB81C',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
