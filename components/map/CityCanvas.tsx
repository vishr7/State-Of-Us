'use client';

import { useState, useRef, useEffect } from 'react';
import { useCityPulseStore } from '@/lib/store';

// ============================================================
// CityCanvas — Procedural Isometric Pittsburgh City Renderer
// Pure HTML5 Canvas 2D, no image assets.
// Art style: chunky retro pixel-art (Township / Design Home).
// Geography: Three Rivers confluence — Allegheny + Mon → Ohio.
// ============================================================

const TW = 64;     // tile width (px)
const TH = 32;     // tile height (px) = TW/2
const GW = 28;     // grid columns
const GH = 28;     // grid rows
const FLOOR_H = 22; // px per building floor

// World origin is centered on the grid midpoint tile (14,14)
const OX = 0;
const OY = -((GW / 2 + GH / 2) * (TH / 2)); // ≈ -448

function tileToScreen(tx: number, ty: number) {
  return { x: (tx - ty) * (TW / 2) + OX, y: (tx + ty) * (TH / 2) + OY };
}

// Stable per-tile pseudo-random in [0,1)
function rng(tx: number, ty: number): number {
  return (((tx * 2654435761) ^ (ty * 2246822519)) >>> 0) / 4294967296;
}

// ── Pittsburgh River Math ────────────────────────────────────
// The Point (river confluence) is at tile (10, 16).
// Allegheny flows from upper-right (NE) toward The Point.
// Mon flows from lower-right (SE) toward The Point.
// Ohio flows from The Point to the left (W).

function alleghenyY(tx: number) { return 16 - (tx - 10) * 10 / 16; }
function monY(tx: number)       { return 16 + (tx - 10) * 6  / 16; }

function isAllegheny(tx: number, ty: number) {
  if (tx < 10 || tx > 27) return false;
  return Math.abs(ty - alleghenyY(tx)) < 1.7;
}
function isMon(tx: number, ty: number) {
  if (tx < 10 || tx > 27) return false;
  return Math.abs(ty - monY(tx)) < 1.7;
}
function isOhio(tx: number, ty: number) {
  if (tx >= 10 || tx < 1) return false;
  return Math.abs(ty - 16) < 2;
}
function isWater(tx: number, ty: number) {
  return isAllegheny(tx, ty) || isMon(tx, ty) || isOhio(tx, ty);
}

// Tiles between Allegheny and Mon (the Golden Triangle wedge)
function isInWedge(tx: number, ty: number) {
  if (tx < 10 || tx > 27) return false;
  return ty > alleghenyY(tx) + 0.5 && ty < monY(tx) - 0.5;
}

// The Three Sisters suspension bridges cross the Allegheny at tx=12,13,14
const BRIDGE_TX = new Set([12, 13, 14]);
// Smithfield truss bridge crosses the Mon at tx=11,12
const MON_BRIDGE_TX = new Set([11, 12]);

function isBridge(tx: number, ty: number) {
  if (BRIDGE_TX.has(tx) && isAllegheny(tx, ty)) return 'suspension';
  if (MON_BRIDGE_TX.has(tx) && isMon(tx, ty)) return 'truss';
  return null;
}

// Cathedral of Learning: special single tile in Oakland
const CATHEDRAL_TX = 20, CATHEDRAL_TY = 14;

// ── Tile Classification ──────────────────────────────────────
type Zone = 'wealthy' | 'middle' | 'lower' | 'tower' | 'civic';
type BridgeKind = 'suspension' | 'truss';

interface TileInfo {
  ground: 'grass' | 'road' | 'water' | 'park' | 'hillside';
  bridge?: BridgeKind;
  building?: Zone;
  cathedral?: true;
  hillElevation?: number; // 0-4 relative to flat
  tree?: boolean;
}

function classifyTile(tx: number, ty: number): TileInfo {
  // Water (checked first — rivers override everything)
  if (isWater(tx, ty)) {
    const b = isBridge(tx, ty);
    return b ? { ground: 'road', bridge: b } : { ground: 'water' };
  }

  // Cathedral of Learning — special tile in Oakland
  if (tx === CATHEDRAL_TX && ty === CATHEDRAL_TY) {
    return { ground: 'grass', cathedral: true };
  }

  // Mount Washington hillside (south of Mon, sloped terrain)
  if (tx >= 10 && tx <= 22) {
    const my = monY(tx);
    if (ty >= my + 1.5 && ty <= my + 7) {
      const elev = Math.min(4, Math.round(ty - my - 1));
      const r = rng(tx, ty);
      if (r > 0.85) return { ground: 'hillside', hillElevation: elev };
      return { ground: 'hillside', hillElevation: elev, building: 'middle' };
    }
  }

  // Major roads
  if (tx === 11 || tx === 15 || tx === 19 || tx === 23) return { ground: 'road' };
  if (ty === 6  || ty === 11 || ty === 16 || ty === 21) return { ground: 'road' };

  // Parks
  if (tx >= 10 && tx <= 13 && ty >= 18 && ty <= 21) return { ground: 'park' }; // Point State Park
  if (tx >= 17 && tx <= 20 && ty >= 7  && ty <= 10) return { ground: 'park' }; // Schenley Park (Oakland)
  if (tx >= 2  && tx <= 5  && ty >= 13 && ty <= 16) return { ground: 'park' }; // West side park

  const r = rng(tx, ty);

  // Golden Triangle downtown towers (the wedge, nearest to The Point)
  if (isInWedge(tx, ty) && tx >= 10 && tx <= 14) {
    return r < 0.1 ? { ground: 'grass' } : { ground: 'grass', building: 'tower' };
  }
  // Mid-downtown / civic (wider part of wedge)
  if (isInWedge(tx, ty) && tx >= 14 && tx <= 18) {
    return r < 0.12 ? { ground: 'grass' } : { ground: 'grass', building: 'civic' };
  }
  // Hill District / Oakland transition (wider wedge right side)
  if (isInWedge(tx, ty) && tx >= 18 && tx <= 23) {
    return r < 0.1 ? { ground: 'grass' } : { ground: 'grass', building: 'middle' };
  }

  // Strip District — along Allegheny, above the river (tx 12–16, just north)
  if (tx >= 12 && tx <= 16) {
    const ay = alleghenyY(tx);
    if (ty >= ay - 5 && ty < ay - 0.5) {
      return r < 0.1 ? { ground: 'grass', tree: r > 0.08 } : { ground: 'grass', building: 'middle' };
    }
  }

  // Lawrenceville — NE along Allegheny, above the river
  if (tx >= 16 && tx <= 23) {
    const ay = alleghenyY(tx);
    if (ty >= ay - 6 && ty < ay - 0.5) {
      return r < 0.1 ? { ground: 'grass', tree: r > 0.08 } : { ground: 'grass', building: 'middle' };
    }
  }

  // Shadyside — wealthy, northeast
  if (tx >= 20 && tx <= 26 && isInWedge(tx, ty)) {
    const mid = (alleghenyY(tx) + monY(tx)) / 2;
    if (ty < mid) {
      return r < 0.12 ? { ground: 'grass', tree: r > 0.1 } : { ground: 'grass', building: 'wealthy' };
    }
  }

  // Homewood — lower-income, far east between rivers
  if (tx >= 22 && tx <= 27 && isInWedge(tx, ty)) {
    const mid = (alleghenyY(tx) + monY(tx)) / 2;
    if (ty >= mid) {
      return r < 0.18 ? { ground: 'grass', tree: r > 0.12 } : { ground: 'grass', building: 'lower' };
    }
  }

  // Outer areas — scattered trees on grass
  if (r < 0.14) return { ground: 'grass', tree: true };
  return { ground: 'grass' };
}

// ── Colors ───────────────────────────────────────────────────
// Bright pixel-art palette — no gradients anywhere.
const SKY_COLOR    = '#87CEEB';
const GRASS_A      = '#52A83C';
const GRASS_B      = '#458A32';
const PARK_COLOR   = '#3FA832';
const HILL_A       = '#6A9A50';
const HILL_B       = '#507A3A';
const WATER_COLOR  = '#1E7EC8';
const WATER_SHINE  = '#5AB4F8';
const ROAD_COLOR   = '#5A6475';
const ROAD_MARK    = 'rgba(255,255,255,0.55)';

// Zone colors [top (lit roof), left face, right face (darkest)]
const ZONE_PAL: Record<Zone, Array<[string, string, string]>> = {
  tower: [
    ['#C8E0F8', '#7AAAC8', '#4878A0'],
    ['#D0D8E8', '#8898B0', '#607080'],
    ['#B8D0B0', '#78A070', '#507848'],
  ],
  civic: [
    ['#E8E0C0', '#C0B888', '#A09860'],
    ['#D8D0B0', '#B0A880', '#908860'],
  ],
  wealthy: [
    ['#E0C880', '#C8A050', '#A87830'],  // cream/gold roof, warm brick
    ['#D04840', '#A83028', '#882018'],  // red roof, warm cream walls
    ['#4860B8', '#3040A0', '#203880'],  // blue roof, cream
  ],
  middle: [
    ['#B84838', '#983020', '#781810'],
    ['#A05840', '#804030', '#602818'],
    ['#8888A0', '#686880', '#484860'],
  ],
  lower: [
    ['#908878', '#706858', '#504838'],
    ['#A09080', '#807060', '#584840'],
    ['#889088', '#688068', '#486048'],
  ],
};

const ZONE_FLOORS: Record<Zone, [number, number]> = {
  tower:  [8, 16],
  civic:  [4, 7],
  wealthy:[3, 5],
  middle: [2, 4],
  lower:  [1, 3],
};

// ── Drawing Primitives ───────────────────────────────────────
function fillPoly(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  fill: string,
  stroke?: string,
) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) {
  const hw = TW / 2, hh = TH / 2;
  fillPoly(ctx, [[cx, cy-hh],[cx+hw, cy],[cx, cy+hh],[cx-hw, cy]], color, 'rgba(0,0,0,0.22)');
}

function buildingBox(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  bh: number,
  topC: string, leftC: string, rightC: string,
) {
  const hw = TW / 2, hh = TH / 2;
  const OL = 'rgba(0,0,0,0.38)';
  // Left (SW) face
  fillPoly(ctx, [
    [cx-hw, cy],
    [cx,    cy+hh],
    [cx,    cy+hh-bh],
    [cx-hw, cy-bh],
  ], leftC, OL);
  // Right (SE) face
  fillPoly(ctx, [
    [cx,    cy+hh],
    [cx+hw, cy],
    [cx+hw, cy-bh],
    [cx,    cy+hh-bh],
  ], rightC, OL);
  // Top face (roof) — lit from upper-left
  fillPoly(ctx, [
    [cx-hw, cy-bh],
    [cx,    cy-hh-bh],
    [cx+hw, cy-bh],
    [cx,    cy+hh-bh],
  ], topC, OL);
}

// Small even-spaced pixel windows on building faces
function pixelWindows(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  bh: number, floors: number,
  tx: number, ty: number,
) {
  const hw = TW / 2, hh = TH / 2;
  const fh = bh / floors;
  for (let f = 0; f < Math.min(floors, 10); f++) {
    const baseY = cy + hh - (f + 0.6) * fh;
    // 2 windows on left face
    for (let w = 0; w < 2; w++) {
      const t = (w + 1) / 3;
      const wx = cx - hw + t * hw;
      const wy = baseY - t * hh * 0.45;
      const lit = rng(tx * 7 + w, ty * 5 + f) > 0.38;
      ctx.fillStyle = lit ? '#FFE898' : '#263850';
      ctx.fillRect(Math.round(wx - 2), Math.round(wy - 3), 4, 5);
    }
    // 2 windows on right face
    for (let w = 0; w < 2; w++) {
      const t = (w + 1) / 3;
      const wx = cx + t * hw;
      const wy = baseY + t * hh * 0.45;
      const lit = rng(tx * 11 + w, ty * 3 + f) > 0.42;
      ctx.fillStyle = lit ? '#FFE898' : '#263850';
      ctx.fillRect(Math.round(wx - 2), Math.round(wy - 3), 4, 5);
    }
  }
}

// Cathedral of Learning — tall gothic tower with pointed spire
function drawCathedral(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const hw = TW / 2, hh = TH / 2;
  const bh = 20 * FLOOR_H; // very tall
  const OL = 'rgba(0,0,0,0.4)';
  const topC = '#D8D0A8', leftC = '#B0A878', rightC = '#888850';

  // Main tower body
  buildingBox(ctx, cx, cy, bh, topC, leftC, rightC);
  pixelWindows(ctx, cx, cy, bh, 16, CATHEDRAL_TX, CATHEDRAL_TY);

  // Gothic spire on top (triangle above roof)
  const spireH = 60;
  const roofY = cy - hh - bh;
  fillPoly(ctx, [
    [cx, roofY - spireH],
    [cx + hw * 0.4, roofY],
    [cx - hw * 0.4, roofY],
  ], '#C8C098', OL);
  // Spire right face (darker)
  fillPoly(ctx, [
    [cx, roofY - spireH],
    [cx + hw * 0.4, roofY],
    [cx, roofY - 10],
  ], '#A8A070', OL);

  // Label
  ctx.save();
  ctx.font = 'bold 8px monospace';
  ctx.fillStyle = '#FFD166';
  ctx.textAlign = 'center';
  ctx.fillText('CATHEDRAL', cx, roofY - spireH - 6);
  ctx.restore();
}

// Drop shadow: soft right-down shadow from a building
function dropShadow(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  bh: number,
) {
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#000';
  // Simple parallelogram shadow to lower-right
  const hw = TW / 2, hh = TH / 2;
  const ox = 10, oy = 5; // shadow offset
  fillPoly(ctx, [
    [cx + ox,      cy + oy - hh],
    [cx + hw + ox, cy + oy],
    [cx + ox,      cy + oy + hh],
    [cx - hw + ox, cy + oy],
  ], '#000');
  ctx.restore();
}

// Lollipop tree — chunky, bright, flat colors
function drawTree(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number) {
  const trunkH = Math.round(14 * scale);
  const cr = Math.round(10 * scale);
  // Shadow
  ctx.save(); ctx.globalAlpha = 0.15;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx + 4 * scale, cy - 2, cr * 0.7, cr * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Trunk
  ctx.fillStyle = '#7B5230';
  ctx.fillRect(Math.round(cx - 2 * scale), cy - trunkH, Math.round(4 * scale), trunkH);
  // Dark canopy base (outline/shadow)
  ctx.fillStyle = '#1E5C2A';
  ctx.beginPath(); ctx.arc(cx, cy - trunkH, cr + 1, 0, Math.PI * 2); ctx.fill();
  // Main canopy
  ctx.fillStyle = '#2E8B3A';
  ctx.beginPath(); ctx.arc(cx, cy - trunkH, cr, 0, Math.PI * 2); ctx.fill();
  // Highlight
  ctx.fillStyle = '#4CC858';
  ctx.beginPath(); ctx.arc(cx - Math.round(2 * scale), cy - trunkH - Math.round(2 * scale), Math.round(cr * 0.55), 0, Math.PI * 2); ctx.fill();
}

// Road tile with dashed centerline
function drawRoad(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  diamond(ctx, cx, cy, ROAD_COLOR);
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = ROAD_MARK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - TW * 0.33, cy); ctx.lineTo(cx + TW * 0.33, cy);
  ctx.stroke();
  ctx.restore();
}

// Suspension bridge tile (Three Sisters — yellow towers)
function drawSuspensionBridge(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  drawRoad(ctx, cx, cy);
  // Tower posts (yellow/gold)
  const towerH = 36;
  const towerW = 5;
  const towerColor = '#FFB81C';
  [-TW * 0.28, TW * 0.28].forEach(ox => {
    ctx.fillStyle = '#C88010';
    ctx.fillRect(Math.round(cx + ox - towerW / 2 + 2), cy - towerH + 2, towerW, towerH);
    ctx.fillStyle = towerColor;
    ctx.fillRect(Math.round(cx + ox - towerW / 2), cy - towerH, towerW, towerH);
    // Cross-beam at top
    ctx.fillStyle = '#FFD060';
    ctx.fillRect(Math.round(cx + ox - towerW * 1.1), cy - towerH, Math.round(towerW * 2.2), 3);
  });
  // Cable lines from tower tops to road surface
  ctx.save();
  ctx.strokeStyle = '#FFB81C';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.8;
  const lt = cx - TW * 0.28, rt = cx + TW * 0.28;
  ctx.beginPath();
  ctx.moveTo(lt, cy - towerH); ctx.lineTo(cx - TW * 0.1, cy - 4);
  ctx.moveTo(lt, cy - towerH); ctx.lineTo(cx - TW * 0.25, cy - 1);
  ctx.moveTo(rt, cy - towerH); ctx.lineTo(cx + TW * 0.1, cy - 4);
  ctx.moveTo(rt, cy - towerH); ctx.lineTo(cx + TW * 0.25, cy - 1);
  ctx.stroke();
  ctx.restore();
}

// Truss bridge (Smithfield Street — dark grey truss over Mon)
function drawTrussBridge(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  drawRoad(ctx, cx, cy);
  const trussColor = '#4A5A6A';
  const trussH = 22;
  // Two vertical supports
  [-TW * 0.3, TW * 0.3].forEach(ox => {
    ctx.fillStyle = trussColor;
    ctx.fillRect(Math.round(cx + ox - 3), cy - trussH, 6, trussH);
  });
  // Horizontal top chord
  ctx.fillStyle = trussColor;
  ctx.fillRect(Math.round(cx - TW * 0.3 - 2), cy - trussH, Math.round(TW * 0.6 + 4), 4);
  // Diagonal struts
  ctx.save(); ctx.strokeStyle = trussColor; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - TW * 0.3, cy - trussH); ctx.lineTo(cx, cy);
  ctx.moveTo(cx, cy - trussH);            ctx.lineTo(cx + TW * 0.3, cy);
  ctx.stroke();
  ctx.restore();
}

// Animated water tile
function drawWater(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number) {
  diamond(ctx, cx, cy, WATER_COLOR);
  const alpha = 0.35 + Math.sin(time * 1.6 + (cx + cy) * 0.04) * 0.12;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.strokeStyle = WATER_SHINE; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - TW * 0.3, cy - 3); ctx.lineTo(cx + TW * 0.3, cy - 3);
  ctx.stroke();
  ctx.restore();
}

// Hillside tile (elevated, darker green for slope)
function drawHillside(ctx: CanvasRenderingContext2D, cx: number, cy: number, elev: number) {
  const lift = elev * 14;
  const color = elev > 2 ? HILL_B : HILL_A;
  // Draw elevated ground diamond
  const hw = TW / 2, hh = TH / 2;
  const OL = 'rgba(0,0,0,0.25)';
  // Slope face (south-facing cliff side)
  fillPoly(ctx, [
    [cx - hw, cy],
    [cx,      cy + hh],
    [cx,      cy + hh - lift],
    [cx - hw, cy - lift],
  ], '#3A6828', OL);
  fillPoly(ctx, [
    [cx,      cy + hh],
    [cx + hw, cy],
    [cx + hw, cy - lift],
    [cx,      cy + hh - lift],
  ], '#305820', OL);
  // Top surface
  fillPoly(ctx, [
    [cx,    cy-hh-lift],
    [cx+hw, cy-lift],
    [cx,    cy+hh-lift],
    [cx-hw, cy-lift],
  ], color, OL);
}

// Pixelated blocky cloud shape (no smooth curves)
function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#F8FCFF';
  // Base rectangle
  ctx.fillRect(x, y, w, h);
  // Bumps on top (blocky 3x3 squares)
  const bumps = Math.floor(w / 14);
  for (let i = 0; i < bumps; i++) {
    ctx.fillRect(x + 4 + i * 14, y - 6, 10, 8);
  }
  // Round-off bottom corners a tiny bit
  ctx.clearRect(x, y + h - 2, 3, 2);
  ctx.clearRect(x + w - 3, y + h - 2, 3, 2);
  ctx.fillStyle = 'rgba(200,220,240,0.5)';
  ctx.fillRect(x + 2, y + h - 2, w - 4, 2); // soft underside
}

// ── Main Component ───────────────────────────────────────────
export default function CityCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  const selectedNeighborhoodId = useCityPulseStore(s => s.ui.selectedNeighborhoodId);
  const selectNeighborhood     = useCityPulseStore(s => s.selectNeighborhood);
  const setMapViewport         = useCityPulseStore(s => s.setMapViewport);
  const storeViewport          = useCityPulseStore(s => s.ui.mapViewport);

  const [zoom, setZoom]               = useState(1);
  const [pan, setPan]                 = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging]   = useState(false);
  const [dragStart, setDragStart]     = useState({ x: 0, y: 0 });
  const [hoveredBadge, setHoveredBadge] = useState<string | null>(null);
  // Issue 4 fix: track mount state to avoid hydration mismatch
  const [mounted, setMounted]         = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setMapViewport({ x: pan.x, y: pan.y, zoom }); }, [pan, zoom, setMapViewport]);

  // Center on neighborhood selection
  useEffect(() => {
    if (!selectedNeighborhoodId) return;
    const centers: Record<string, ReturnType<typeof tileToScreen>> = {
      shadyside:      tileToScreen(22, 13),
      lawrenceville:  tileToScreen(19, 7),
      homewood:       tileToScreen(24, 17),
    };
    const c = centers[selectedNeighborhoodId];
    if (c) { setPan({ x: -c.x, y: -c.y }); setZoom(1.3); }
  }, [selectedNeighborhoodId]);

  useEffect(() => {
    if (storeViewport && Math.abs(storeViewport.x - pan.x) > 40)
      setPan({ x: storeViewport.x, y: storeViewport.y });
  }, [storeViewport, pan.x]);

  // ── Render loop ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const startT = performance.now();

    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = container.clientWidth  * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width  = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);

    function render() {
      if (!ctx || !canvas) return;
      const time = (performance.now() - startT) * 0.001;
      const cw = canvas.width, ch = canvas.height;
      const dpr = window.devicePixelRatio || 1;

      ctx.clearRect(0, 0, cw, ch);

      // ── Sky — flat pixel-art solid fill (NO gradient) ──────
      ctx.fillStyle = SKY_COLOR;
      ctx.fillRect(0, 0, cw, ch);

      // Blocky pixel-art clouds (rectangles, not smooth ellipses)
      ([
        [0.10, 0.07, 90, 20],
        [0.50, 0.04, 120, 24],
        [0.78, 0.08, 72, 18],
        [0.32, 0.12, 56, 16],
      ] as [number, number, number, number][]).forEach(([rx, ry, w, h]) => {
        drawCloud(
          ctx,
          rx * cw + Math.sin(time * 0.035 + rx * 8) * 12,
          ry * ch,
          w, h,
        );
      });

      // ── Camera transform ────────────────────────────────────
      ctx.save();
      ctx.translate(cw / 2 + pan.x * dpr, ch / 2 + pan.y * dpr);
      ctx.scale(zoom * dpr, zoom * dpr);
      ctx.imageSmoothingEnabled = false;

      // Precompute tiles once
      const tiles: Array<{
        tx: number; ty: number;
        cx: number; cy: number;
        info: TileInfo;
      }> = [];
      for (let ty = 0; ty < GH; ty++) {
        for (let tx = 0; tx < GW; tx++) {
          const { x: cx, y: cy } = tileToScreen(tx, ty);
          tiles.push({ tx, ty, cx, cy, info: classifyTile(tx, ty) });
        }
      }

      // ── Pass 1: Ground tiles ────────────────────────────────
      for (const { tx, ty, cx, cy, info } of tiles) {
        switch (info.ground) {
          case 'water':
            drawWater(ctx, cx, cy, time);
            break;
          case 'road':
            if      (info.bridge === 'suspension') drawSuspensionBridge(ctx, cx, cy);
            else if (info.bridge === 'truss')      drawTrussBridge(ctx, cx, cy);
            else                                   drawRoad(ctx, cx, cy);
            break;
          case 'park':
            diamond(ctx, cx, cy, PARK_COLOR);
            break;
          case 'hillside':
            drawHillside(ctx, cx, cy, info.hillElevation ?? 0);
            break;
          default: {
            const shade = rng(tx, ty) > 0.5 ? GRASS_A : GRASS_B;
            diamond(ctx, cx, cy, shade);
            break;
          }
        }
      }

      // ── Pass 2: Buildings, trees, special structures ────────
      for (const { tx, ty, cx, cy, info } of tiles) {
        // Cathedral of Learning — special, drawn before other buildings
        if (info.cathedral) {
          drawCathedral(ctx, cx, cy);
          continue;
        }

        // Trees
        if (info.tree && !info.building) {
          const scale = 0.65 + rng(tx * 3, ty * 3) * 0.55;
          drawTree(ctx, cx, cy - TH / 2, scale);
          continue;
        }

        // Park trees
        if (info.ground === 'park') {
          if (rng(tx, ty) > 0.25) {
            const scale = 0.55 + rng(tx * 5, ty * 7) * 0.65;
            const ox = (rng(tx, ty + 1) - 0.5) * 22;
            drawTree(ctx, cx + ox, cy - TH / 2, scale);
          }
          continue;
        }

        if (!info.building) continue;

        const zone = info.building;
        const r    = rng(tx, ty);
        const [lo, hi] = ZONE_FLOORS[zone];
        const floors   = lo + Math.round(r * (hi - lo));

        // Hillside buildings are shorter
        const floorMult = info.ground === 'hillside' ? 0.65 : 1;
        const bh = Math.round(floors * FLOOR_H * floorMult);

        const pal = ZONE_PAL[zone];
        const ci  = Math.floor(rng(tx + 1, ty) * pal.length);
        const [topC, leftC, rightC] = pal[ci];

        // Drop shadow behind building
        dropShadow(ctx, cx, cy, bh);
        buildingBox(ctx, cx, cy, bh, topC, leftC, rightC);
        if (zoom > 0.55) pixelWindows(ctx, cx, cy, bh, floors, tx, ty);
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, [pan, zoom]);

  // ── Input handlers ───────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.hud-ctrl')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp   = () => setIsDragging(false);
  const handleWheel     = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(3.0, Math.max(0.4, z * (e.deltaY < 0 ? 1.15 : 0.88))));
  };
  const handleZoomIn  = () => setZoom(z => Math.min(3.0, z * 1.25));
  const handleZoomOut = () => setZoom(z => Math.max(0.4, z * 0.8));
  const handleReset   = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // ── Neighborhood badge definitions ───────────────────────────
  // Tile centers match classifyTile zone assignments above
  const badges = [
    {
      id: 'shadyside', name: 'SHADYSIDE', subtitle: 'Wealthy',
      wx: tileToScreen(22, 13).x, wy: tileToScreen(22, 13).y,
      borderColor: '#FFB81C', bgColor: 'rgba(14,28,10,0.93)', textColor: '#FFD166',
      tooltip: 'Shadyside — Wealthy | 81% Happiness | $94K Median Income',
      action: () => selectNeighborhood('shadyside'),
    },
    {
      id: 'lawrenceville', name: 'LAWRENCEVILLE', subtitle: 'Middle-Income',
      wx: tileToScreen(19, 7).x, wy: tileToScreen(19, 7).y,
      borderColor: '#60A5FA', bgColor: 'rgba(8,18,40,0.93)', textColor: '#93C5FD',
      tooltip: 'Lawrenceville — Middle-Income | 68% Happiness | $52K Median Income',
      action: () => selectNeighborhood('lawrenceville'),
    },
    {
      id: 'homewood', name: 'HOMEWOOD', subtitle: 'Lower-Income',
      wx: tileToScreen(24, 17).x, wy: tileToScreen(24, 17).y,
      borderColor: '#F87171', bgColor: 'rgba(28,8,8,0.93)', textColor: '#FCA5A5',
      tooltip: 'Homewood — Lower-Income | 42% Happiness | $28K Median Income',
      action: () => selectNeighborhood('homewood'),
    },
  ];

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden select-none cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block pointer-events-none"
      />

      {/* Neighborhood badges — only rendered client-side (avoids hydration mismatch) */}
      {mounted && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {badges.map(b => {
            const cw = containerRef.current?.clientWidth  ?? 800;
            const ch = containerRef.current?.clientHeight ?? 600;
            const sx = cw / 2 + pan.x + b.wx * zoom;
            const sy = ch / 2 + pan.y + b.wy * zoom;
            if (sx < -220 || sx > cw + 220 || sy < -120 || sy > ch + 120) return null;
            const isSelected = selectedNeighborhoodId === b.id;
            const isHovered  = hoveredBadge === b.id;
            return (
              <div
                key={b.id}
                className="absolute pointer-events-auto transition-transform hover:scale-105 active:scale-95 cursor-pointer z-10"
                style={{ left: sx, top: sy, transform: 'translate(-50%, -100%)' }}
                onClick={e => { e.stopPropagation(); b.action(); }}
                onMouseEnter={() => setHoveredBadge(b.id)}
                onMouseLeave={() => setHoveredBadge(null)}
                title={b.tooltip}
              >
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg shadow-2xl backdrop-blur-md"
                  style={{
                    background: b.bgColor,
                    border: `2px solid ${b.borderColor}`,
                    boxShadow: isSelected || isHovered
                      ? `0 0 18px ${b.borderColor}`
                      : '0 4px 14px rgba(0,0,0,0.7)',
                  }}
                >
                  <div className="flex flex-col leading-none">
                    <span className="text-xs font-black tracking-wider uppercase" style={{ color: b.textColor }}>
                      {b.name}
                    </span>
                    <span className="text-[10px] text-slate-300 font-medium mt-0.5">{b.subtitle}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* HUD controls */}
      <div className="hud-ctrl absolute bottom-4 right-4 flex items-center gap-1.5 z-20">
        {([
          { label: '+',     title: 'Zoom In',    onClick: handleZoomIn,  cls: 'w-9 h-9 text-lg font-black' },
          { label: '−',     title: 'Zoom Out',   onClick: handleZoomOut, cls: 'w-9 h-9 text-lg font-black' },
          { label: 'Reset', title: 'Reset View', onClick: handleReset,   cls: 'h-9 px-3 text-xs font-bold' },
        ] as const).map(btn => (
          <button
            key={btn.label}
            onClick={btn.onClick}
            title={btn.title}
            className={`${btn.cls} rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-xl cursor-pointer`}
            style={{ background: 'rgba(10,22,40,0.95)', border: '1.5px solid #1E3050', color: '#F0F4FA' }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Interaction hint */}
      <div
        className="hud-ctrl absolute top-3 left-4 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 pointer-events-none z-20 backdrop-blur-md"
        style={{ background: 'rgba(10,22,40,0.85)', border: '1px solid rgba(30,48,80,0.7)', color: '#94A3B8' }}
      >
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <span>Click neighborhoods · Drag to pan · Scroll to zoom</span>
      </div>
    </div>
  );
}
