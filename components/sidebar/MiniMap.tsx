'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useCityPulseStore } from '@/lib/store';
import {
  TW, TH, GW, GH,
  tileToScreen, screenToTile, rng,
  classifyTile, isWater,
  NEIGHBORHOOD_MARKERS, PITTSBURGH_LANDMARKS,
  WORLD_BOUNDS,
  TileInfo,
} from '../map/cityMapData';

// ============================================================
// MiniMap Component — Bird's-Eye Pittsburgh City Overview
// Top-down rectangular grid — each tile maps 1:1 to a pixel rect.
// ============================================================

export default function MiniMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  const viewport = useCityPulseStore(s => s.ui.mapViewport);
  const setMapViewport = useCityPulseStore(s => s.setMapViewport);
  const selectedNeighborhoodId = useCityPulseStore(s => s.ui.selectedNeighborhoodId);
  const selectNeighborhood = useCityPulseStore(s => s.selectNeighborhood);

  const [hoveredNeighborhood, setHoveredNeighborhood] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Minimap container dimensions
  const W = 184;
  const H = 142;

  // Bird's-eye grid mapping — each tile is a plain rectangle
  const padX = 4;
  const padY = 20; // leave room for the header HUD
  const padB = 8;  // bottom pad
  const cellW = (W - padX * 2) / GW;
  const cellH = (H - padY - padB) / GH;

  // Grid tile → minimap pixel (top-left of tile cell)
  const tileToMinimap = useCallback((tx: number, ty: number) => ({
    x: padX + tx * cellW,
    y: padY + ty * cellH,
  }), [cellW, cellH]);

  // Minimap pixel → grid tile (float, for pan math)
  const minimapToTile = useCallback((mx: number, my: number) => ({
    tx: (mx - padX) / cellW,
    ty: (my - padY) / cellH,
  }), [cellW, cellH]);

  // Bake the actual city map terrain once onto an offscreen canvas
  useEffect(() => {
    const dpr = 2;
    const offscreen = document.createElement('canvas');
    offscreen.width = W * dpr;
    offscreen.height = H * dpr;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0c1a29';
    ctx.fillRect(0, 0, W, H);

    // Draw each tile as a filled rectangle
    for (let ty = 0; ty < GH; ty++) {
      for (let tx = 0; tx < GW; tx++) {
        const info = classifyTile(tx, ty);
        const { x, y } = tileToMinimap(tx, ty);
        const w = cellW + 0.5; // slight overlap to avoid grid gaps
        const h = cellH + 0.5;

        let fill: string;
        if (info.ground === 'water') {
          fill = '#2a6080';
        } else if (info.ground === 'road') {
          fill = '#3a444e';
        } else if (info.ground === 'park') {
          fill = '#3a6630';
        } else if (info.ground === 'hillside') {
          fill = '#355228';
        } else {
          // grass base — slight variation
          fill = rng(tx, ty) > 0.5 ? '#445e35' : '#4e6e3c';
        }

        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);

        // Building tints drawn on top of ground
        if (info.building && !info.cathedral) {
          let bFill: string;
          if (info.building === 'tower') bFill = 'rgba(200,185,155,0.85)';
          else if (info.building === 'wealthy') bFill = 'rgba(220,185,90,0.75)';
          else if (info.building === 'middle') bFill = 'rgba(100,150,200,0.70)';
          else bFill = 'rgba(180,90,80,0.70)'; // lower
          ctx.fillStyle = bFill;
          ctx.fillRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }

        // Cathedral dot
        if (info.cathedral) {
          ctx.fillStyle = '#F5EBD0';
          const cx = x + cellW / 2;
          const cy = y + cellH / 2;
          ctx.fillRect(cx - 1, cy - 2, 2, 3);
        }

        // Tree dot
        if (info.tree && info.ground !== 'water') {
          ctx.fillStyle = '#1e3d14';
          const cx = x + cellW / 2;
          const cy = y + cellH / 2;
          ctx.fillRect(cx - 0.5, cy - 0.5, 1, 1);
        }

        // Bridge highlight
        if (info.bridge === 'suspension') {
          ctx.fillStyle = '#FFB81C';
          ctx.fillRect(x, y, w, h);
        } else if (info.bridge === 'truss') {
          ctx.fillStyle = '#607080';
          ctx.fillRect(x, y, w, h);
        }
      }
    }

    // Water shimmer: thin highlight lines across water tiles
    ctx.strokeStyle = 'rgba(120,180,220,0.2)';
    ctx.lineWidth = 0.4;
    for (let ty = 0; ty < GH; ty++) {
      for (let tx = 0; tx < GW; tx++) {
        if (isWater(tx, ty)) {
          const { x, y } = tileToMinimap(tx, ty);
          if ((tx + ty) % 3 === 0) {
            ctx.beginPath();
            ctx.moveTo(x, y + cellH * 0.5);
            ctx.lineTo(x + cellW, y + cellH * 0.5);
            ctx.stroke();
          }
        }
      }
    }

    for (const landmark of PITTSBURGH_LANDMARKS) {
      const { x, y } = tileToMinimap(landmark.tx, landmark.ty);
      const cx = x + cellW / 2;
      const cy = y + cellH / 2;
      ctx.fillStyle = landmark.kind === 'stadium' ? '#FFB81C' : '#F5EBD0';
      ctx.strokeStyle = '#071320';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, landmark.kind === 'stadium' ? 2.5 : 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    offscreenRef.current = offscreen;

    // Render offscreen to main canvas
    const mainCanvas = canvasRef.current;
    if (mainCanvas) {
      mainCanvas.width = W * dpr;
      mainCanvas.height = H * dpr;
      const mctx = mainCanvas.getContext('2d');
      if (mctx) {
        mctx.drawImage(offscreen, 0, 0);
      }
    }
  }, [tileToMinimap]);

  // Viewport box — map isometric camera position back to bird's-eye tile coords
  const zoom = Math.max(0.4, Math.min(3, viewport.zoom || 0.65));
  const containerW = viewport.containerW ?? 900;
  const containerH = viewport.containerH ?? 650;

  // Center tile of the viewport
  const camScreenX = -(viewport.x || 0);
  const camScreenY = -(viewport.y || 0);
  const { tx: camTX, ty: camTY } = screenToTile(camScreenX, camScreenY);
  const camCenter = tileToMinimap(camTX, camTY);

  // Viewport box dimensions: visible screen area → approximate tile span → minimap px
  const visW = containerW / zoom;
  const visH = containerH / zoom;
  const boxW = Math.max(16, Math.min(W * 0.9, (visW / WORLD_BOUNDS.width) * (W - padX * 2)));
  const boxH = Math.max(12, Math.min(H * 0.9, (visH / WORLD_BOUNDS.height) * (H - padY - padB)));

  const boxX = Math.max(padX, Math.min(W - padX - boxW, camCenter.x - boxW / 2));
  const boxY = Math.max(padY, Math.min(H - padB - boxH, camCenter.y - boxH / 2));

  // Pan main canvas to minimap click point
  const panToMinimapPoint = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = Math.max(0, Math.min(W, clientX - rect.left));
    const my = Math.max(0, Math.min(H, clientY - rect.top));

    const { tx, ty } = minimapToTile(mx, my);
    const { x: wx, y: wy } = tileToScreen(tx, ty);
    setMapViewport({ x: -wx, y: -wy });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-neighborhood-pin]')) return;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    panToMinimapPoint(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    panToMinimapPoint(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-hidden flex-shrink-0 relative select-none cursor-crosshair group shadow-xl"
      style={{
        width: '100%',
        height: H,
        background: '#091829',
        border: '1.5px solid #1E3556',
        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      title="Click or drag to navigate Pittsburgh"
    >
      {/* Base Canvas — bird's-eye Pittsburgh map */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block pointer-events-none"
        style={{ width: W, height: H, imageRendering: 'pixelated' }}
      />

      {/* Neighborhood interactive beacon pins */}
      {NEIGHBORHOOD_MARKERS.map(m => {
        const pos = tileToMinimap(m.tx, m.ty);
        const isSelected = selectedNeighborhoodId === m.id;
        const isHovered = hoveredNeighborhood === m.id;

        return (
          <div
            key={m.id}
            data-neighborhood-pin
            className="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer transition-transform hover:scale-125"
            style={{ left: pos.x + cellW / 2, top: pos.y + cellH / 2 }}
            onClick={(e) => {
              e.stopPropagation();
              selectNeighborhood(m.id);
            }}
            onMouseEnter={() => setHoveredNeighborhood(m.id)}
            onMouseLeave={() => setHoveredNeighborhood(null)}
            title={m.tooltip}
          >
            {(isSelected || isHovered) && (
              <span
                className="absolute inset-0 rounded-full animate-ping pointer-events-none"
                style={{ backgroundColor: m.color, opacity: 0.6, transform: 'scale(2.2)' }}
              />
            )}
            <div
              className="px-1 py-0.5 rounded text-[8px] font-black leading-none flex items-center justify-center shadow-lg border backdrop-blur-sm"
              style={{
                backgroundColor: isSelected ? m.color : m.bgColor,
                color: isSelected ? '#0A1628' : m.color,
                borderColor: m.borderColor,
                boxShadow: isSelected ? `0 0 8px ${m.color}` : '0 1px 4px rgba(0,0,0,0.8)',
              }}
            >
              {m.short}
            </div>
          </div>
        );
      })}

      {/* Camera viewport indicator */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        viewBox={`0 0 ${W} ${H}`}
      >
        <rect
          x={boxX} y={boxY} width={boxW} height={boxH}
          fill="rgba(255,255,255,0.07)"
          stroke="#FFFFFF" strokeWidth="1.5" rx="2"
          className="transition-all duration-75"
        />
        <path
          d={`
            M ${boxX} ${boxY + 5} L ${boxX} ${boxY} L ${boxX + 5} ${boxY}
            M ${boxX + boxW - 5} ${boxY} L ${boxX + boxW} ${boxY} L ${boxX + boxW} ${boxY + 5}
            M ${boxX} ${boxY + boxH - 5} L ${boxX} ${boxY + boxH} L ${boxX + 5} ${boxY + boxH}
            M ${boxX + boxW - 5} ${boxY + boxH} L ${boxX + boxW} ${boxY + boxH} L ${boxX + boxW} ${boxY + boxH - 5}
          `}
          fill="none" stroke="#FFFFFF" strokeWidth="2"
        />
        <circle cx={boxX + boxW / 2} cy={boxY + boxH / 2} r="2" fill="#FFFFFF" opacity="0.8" />
        <line x1={boxX + boxW / 2 - 4} y1={boxY + boxH / 2} x2={boxX + boxW / 2 + 4} y2={boxY + boxH / 2} stroke="#FFFFFF" strokeWidth="0.8" opacity="0.5" />
        <line x1={boxX + boxW / 2} y1={boxY + boxH / 2 - 4} x2={boxX + boxW / 2} y2={boxY + boxH / 2 + 4} stroke="#FFFFFF" strokeWidth="0.8" opacity="0.5" />
      </svg>

      {/* Top HUD Header */}
      <div className="absolute top-1.5 left-2 right-2 flex items-center justify-between pointer-events-none z-20">
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950/70 border border-slate-700/50 backdrop-blur-sm text-[9px] font-bold text-slate-300 tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>PITTSBURGH</span>
        </div>
        <div className="flex flex-col items-center bg-slate-950/70 px-1 py-0.5 rounded border border-slate-700/50 backdrop-blur-sm">
          <span className="text-[8px] font-black text-sky-300 leading-none">N</span>
          <svg className="w-2 h-2 text-sky-400" viewBox="0 0 10 10">
            <polygon points="5,0 8,8 5,6 2,8" fill="currentColor" />
          </svg>
        </div>
      </div>

      {/* Bottom HUD: zoom level */}
      <div className="absolute bottom-1.5 left-2 pointer-events-none z-20">
        <div className="px-1.5 py-0.5 rounded bg-slate-950/70 border border-slate-700/50 backdrop-blur-sm text-[8px] font-mono font-bold text-slate-400">
          {zoom.toFixed(1)}x
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredNeighborhood && (
        <div className="absolute bottom-1.5 right-2 px-2 py-0.5 rounded bg-slate-950/90 border border-slate-600 backdrop-blur-sm text-[9px] font-semibold text-amber-200 pointer-events-none z-30 shadow-lg animate-in fade-in duration-100">
          {NEIGHBORHOOD_MARKERS.find(m => m.id === hoveredNeighborhood)?.name}
        </div>
      )}
    </div>
  );
}
