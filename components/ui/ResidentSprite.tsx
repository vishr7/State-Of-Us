'use client';

import { useEffect, useRef } from 'react';
import type { Resident } from '@/lib/types';
import { drawResidentPortrait } from '../map/residentWalkers';

// ============================================================
// ResidentSprite — a resident's profile picture, drawn as the same
// pixel figure that walks around the map (skin, hair, outfit, glasses,
// hat are all derived from the resident's id, so it always matches).
// ============================================================

export default function ResidentSprite({ resident, size = 56, className = '' }: { resident: Resident; size?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawResidentPortrait(ctx, resident, size);
  }, [resident, size]);

  return (
    <div
      className={`flex-shrink-0 overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(6, size * 0.22),
        border: `1.5px solid ${resident.portraitColor}88`,
        background: `${resident.portraitColor}22`,
      }}
    >
      <canvas ref={canvasRef} role="img" aria-label={resident.name} style={{ width: size, height: size, display: 'block' }} />
    </div>
  );
}
