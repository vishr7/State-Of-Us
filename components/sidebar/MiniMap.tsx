'use client';

import { useCityPulseStore } from '@/lib/store';

// ============================================================
// MiniMap Component — Pixel Art City Overview
// Matching Screenshot 1:
// - Shows pixel art island layout (/minimap.png)
// - Dynamic white camera viewport rectangle
// - Click on minimap to pan main city map
// ============================================================

export default function MiniMap() {
  const viewport = useCityPulseStore(s => s.ui.mapViewport);
  const setMapViewport = useCityPulseStore(s => s.setMapViewport);
  const selectNeighborhood = useCityPulseStore(s => s.selectNeighborhood);

  // Minimap container dimensions
  const W = 180;
  const H = 140;

  // Calculate normalized viewport box
  const zoom = Math.max(0.5, Math.min(3, viewport.zoom || 1));
  const boxW = Math.max(28, Math.min(W * 0.9, (W * 0.5) / zoom));
  const boxH = Math.max(20, Math.min(H * 0.9, (H * 0.45) / zoom));

  // Offset mapping from main canvas pan to minimap
  const boxX = Math.max(4, Math.min(W - boxW - 4, W / 2 - boxW / 2 - (viewport.x || 0) * 0.08));
  const boxY = Math.max(4, Math.min(H - boxH - 4, H / 2 - boxH / 2 - (viewport.y || 0) * 0.08));

  const handleMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Pan the main map toward clicked area
    const normX = (clickX / W - 0.5) * 400;
    const normY = (clickY / H - 0.5) * 300;
    setMapViewport({ x: -normX, y: -normY });
  };

  return (
    <div
      className="rounded-xl overflow-hidden flex-shrink-0 relative select-none cursor-crosshair group"
      style={{
        width: '100%',
        background: '#091829',
        border: '1.5px solid #1E3556',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
      onClick={handleMinimapClick}
      title="Click anywhere to pan the city map"
    >
      {/* Pixel art base minimap */}
      <img
        src="/minimap.png"
        alt="City Overview Minimap"
        className="w-full object-cover block"
        style={{
          height: H,
          imageRendering: 'pixelated',
        }}
      />

      {/* Interactive viewport camera rectangle */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
      >
        {/* Dynamic camera bounds box */}
        <rect
          x={boxX}
          y={boxY}
          width={boxW}
          height={boxH}
          fill="rgba(255, 255, 255, 0.08)"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          rx="2"
          className="transition-all duration-75"
        />

        {/* Center reticle */}
        <circle
          cx={boxX + boxW / 2}
          cy={boxY + boxH / 2}
          r="2"
          fill="#FFFFFF"
          opacity="0.6"
        />
      </svg>
    </div>
  );
}

