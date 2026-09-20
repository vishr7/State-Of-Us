'use client';

import { useEffect, useRef } from 'react';
import type { Resident } from '@/lib/types';
import { drawResidentPortrait } from '../map/residentWalkers';

// ============================================================
// PersonaPortrait — the large speaker portrait for a resident who walks the map.
// Same figure as their walker (and Featured Resident photo), in the same 200x260
// frame the generic ResidentPortrait uses, so it drops into the narrator unchanged.
// ============================================================

export default function PersonaPortrait({ resident }: { resident: Resident }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(200 * dpr);
    canvas.height = Math.round(260 * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, 200, 260);
    ctx.fillStyle = '#17364a';
    ctx.beginPath(); ctx.roundRect(0, 0, 200, 260, 24); ctx.fill();
    ctx.fillStyle = '#244a5c';
    ctx.beginPath(); ctx.arc(100, 120, 84, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(-25, 22);
    drawResidentPortrait(ctx, resident, 250);
    ctx.restore();
  }, [resident]);

  return <canvas ref={canvasRef} role="img" aria-label={`Portrait of ${resident.name}`} style={{ display: 'block', width: '100%', height: '100%' }} />;
}
