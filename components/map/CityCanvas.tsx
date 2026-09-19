'use client';

import { useState, useRef, useEffect } from 'react';
import { useCityPulseStore } from '@/lib/store';

// ============================================================
// CityCanvas — Procedural Isometric Pittsburgh City Renderer
// HTML5 Canvas 2D with an illustrated 4 × 4 sprite atlas.
// Art style: detailed illustrated indie city with individually placed sprites.
// Geography: Three Rivers confluence — Allegheny + Mon → Ohio.
// ============================================================

const TW = 96;     // tile width (px)
const TH = 48;     // tile height (px) = TW/2
const GW = 28;     // grid columns
const GH = 28;     // grid rows


// World origin is centered on the grid midpoint tile (14,14)
const OX = 0;
const OY = -((GW / 2 + GH / 2) * (TH / 2)); // ≈ -448

function tileToScreen(tx: number, ty: number) {
  return { x: (tx - ty) * (TW / 2) + OX, y: (tx + ty) * (TH / 2) + OY };
}

// Stable per-tile pseudo-random in [0,1)
function rng(tx: number, ty: number): number {
  let seed = Math.imul(tx + 71, 374761393) ^ Math.imul(ty + 137, 668265263);
  seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
  return ((seed ^ (seed >>> 16)) >>> 0) / 4294967296;
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

// Stylized Three Sisters crossings aligned with the street grid.
const BRIDGE_TX = new Set([11, 15, 19]);
// Truss crossings over the Mon.
const MON_BRIDGE_TX = new Set([15, 23]);

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

  // Major roads
  if (tx === 3 || tx === 7 || tx === 11 || tx === 15 || tx === 19 || tx === 23) return { ground: 'road' };
  if (ty === 1 || ty === 6 || ty === 11 || ty === 16 || ty === 21 || ty === 26) return { ground: 'road' };

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

  // Outer areas — scattered trees on grass
  if (r < 0.22) return { ground: 'grass', tree: true };
  return { ground: 'grass', building: tx < 10 ? 'wealthy' : 'middle' };
}

// ── Colors ───────────────────────────────────────────────────
// Bright pixel-art palette — no gradients anywhere.
const SKY_COLOR    = '#244c48';
const GRASS_A      = '#718e51';
const GRASS_B      = '#718e51';
const PARK_COLOR   = '#71964e';
const HILL_A       = '#6A9A50';
const HILL_B       = '#507A3A';
const WATER_COLOR  = '#277f99';
const WATER_SHINE  = '#91d3d5';
const ROAD_COLOR   = '#59616a';
const ROAD_MARK    = 'rgba(255,255,255,0.55)';

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
  fillPoly(ctx, [[cx, cy-hh],[cx+hw, cy],[cx, cy+hh],[cx-hw, cy]], color);
}

// Atlas cells are isolated transparent illustrations, rendered independently.
function drawSprite(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, index: number, x: number, y: number) {
  const sw = atlas.naturalWidth / 4, sh = atlas.naturalHeight / 4;
  const size = TW * 1.04;
  ctx.drawImage(atlas, (index % 4) * sw, Math.floor(index / 4) * sh, sw, sh,
    x - size / 2, y - size + TH * 0.5, size, size);
}

// Draw streets in tile-local coordinates so lanes meet at every intersection.
function drawRoad(ctx: CanvasRenderingContext2D, cx: number, cy: number, tx?: number, ty?: number) {
  ctx.save();
  ctx.transform(TW / 2, TH / 2, -TW / 2, TH / 2, cx, cy);
  ctx.fillStyle = '#b9b7a0';
  ctx.fillRect(-0.5, -0.5, 1, 1);
  const roadAt = (dx: number, dy: number) => tx === undefined || ty === undefined || classifyTile(tx + dx, ty + dy).ground === 'road';
  const alongX = tx !== undefined && (roadAt(-1, 0) || roadAt(1, 0));
  const alongY = roadAt(0, -1) || roadAt(0, 1);
  ctx.fillStyle = ROAD_COLOR;
  if (alongX) ctx.fillRect(-0.5, -0.34, 1, 0.68);
  if (alongY) ctx.fillRect(-0.34, -0.5, 0.68, 1);
  ctx.strokeStyle = '#ddd5a5';
  ctx.lineWidth = 0.018;
  ctx.setLineDash([0.12, 0.1]);
  if (!(alongX && alongY)) {
    ctx.beginPath();
    if (alongX) { ctx.moveTo(-0.5, 0); ctx.lineTo(0.5, 0); }
    else { ctx.moveTo(0, -0.5); ctx.lineTo(0, 0.5); }
    ctx.stroke();
  } else {
    ctx.fillStyle = '#e6dfca';
    for (let stripe = -0.26; stripe < 0.3; stripe += 0.1) {
      ctx.fillRect(stripe, -0.46, 0.055, 0.12);
      ctx.fillRect(stripe, 0.34, 0.055, 0.12);
      ctx.fillRect(-0.46, stripe, 0.12, 0.055);
      ctx.fillRect(0.34, stripe, 0.12, 0.055);
    }
  }
  ctx.restore();
}

// Stone embankments follow the actual river edges.
function drawQuay(ctx: CanvasRenderingContext2D, tx: number, ty: number, cx: number, cy: number) {
  const edges = [
    { dx: -1, dy: 0, a: [-48, 0], b: [0, -24] },
    { dx: 0, dy: -1, a: [0, -24], b: [48, 0] },
    { dx: 1, dy: 0, a: [48, 0], b: [0, 24] },
    { dx: 0, dy: 1, a: [0, 24], b: [-48, 0] },
  ];
  for (const edge of edges) {
    if (!isWater(tx + edge.dx, ty + edge.dy)) continue;
    const [ax, ay] = edge.a, [bx, by] = edge.b;
    fillPoly(ctx, [[cx+ax,cy+ay],[cx+bx,cy+by],[cx+bx,cy+by+8],[cx+ax,cy+ay+8]], '#777c72');
    ctx.strokeStyle = '#d9cfaa'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx+ax,cy+ay); ctx.lineTo(cx+bx,cy+by); ctx.stroke();
    for (let t = 0; t <= 1; t += 0.2) {
      const px = cx+ax+(bx-ax)*t, py = cy+ay+(by-ay)*t;
      ctx.fillStyle = '#414e49'; ctx.fillRect(px-0.8,py-5,1.6,6);
    }
  }
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
  for (let i = 0; i < 4; i++) {
    const offset = Math.sin(time * 0.5 + i + cx) * 4;
    const ry = cy - 12 + i * 7;
    ctx.moveTo(cx - 12 + offset, ry); ctx.lineTo(cx + 8 + offset, ry);
  }
  ctx.stroke();
  ctx.restore();
}

// ── Main Component ───────────────────────────────────────────
export default function CityCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  const selectedNeighborhoodId = useCityPulseStore(s => s.ui.selectedNeighborhoodId);
  const selectNeighborhood     = useCityPulseStore(s => s.selectNeighborhood);
  const setMapViewport         = useCityPulseStore(s => s.setMapViewport);
  const storeViewport          = useCityPulseStore(s => s.ui.mapViewport);

  const zoom = storeViewport.zoom;
  const pan = storeViewport;
  const setZoom = (value: number | ((z: number) => number)) => setMapViewport({ zoom: typeof value === 'function' ? value(zoom) : value });
  const setPan = (value: { x: number; y: number }) => setMapViewport(value);
  const [atlas, setAtlas] = useState<HTMLImageElement | null>(null);
  const [assetError, setAssetError] = useState(false);
  const policies = useCityPulseStore(s => s.policies);
  const turn = useCityPulseStore(s => s.city.turn);
  const isPlaying = useCityPulseStore(s => s.ui.isPlaying);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setAtlas(img);
    img.onerror = () => setAssetError(true);
    img.src = '/sprites/city-atlas.png';
    return () => { img.onload = null; img.onerror = null; };
  }, []);
  const [isDragging, setIsDragging]   = useState(false);
  const [dragStart, setDragStart]     = useState({ x: 0, y: 0 });
  const [hoveredBadge, setHoveredBadge] = useState<string | null>(null);
  // Issue 4 fix: track mount state to avoid hydration mismatch
  const [mounted, setMounted]         = useState(false);

  useEffect(() => { setMounted(true); }, []);


  // Center on neighborhood selection
  useEffect(() => {
    if (!selectedNeighborhoodId) return;
    const centers: Record<string, ReturnType<typeof tileToScreen>> = {
      shadyside:      tileToScreen(22, 13),
      lawrenceville:  tileToScreen(19, 7),
      homewood:       tileToScreen(24, 17),
    };
    const c = centers[selectedNeighborhoodId];
    if (c) setMapViewport({ x: -c.x * 1.3, y: -c.y * 1.3, zoom: 1.3 });
  }, [selectedNeighborhoodId, setMapViewport]);

  // ── Render loop ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !atlas) return;
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

    // Static geography is shared by every animation frame.
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

    tiles.sort((a, b) => a.cy - b.cy || a.cx - b.cx);

    function render() {
      if (!ctx || !canvas || !atlas) return;
      const time = (performance.now() - startT) * 0.001;
      const cw = canvas.width, ch = canvas.height;
      const dpr = window.devicePixelRatio || 1;

      ctx.clearRect(0, 0, cw, ch);

      // ── Sky — flat pixel-art solid fill (NO gradient) ──────
      ctx.fillStyle = SKY_COLOR;
      ctx.fillRect(0, 0, cw, ch);

      // ── Camera transform ────────────────────────────────────
      ctx.save();
      ctx.translate(cw / 2 + pan.x * dpr, ch / 2 + pan.y * dpr);
      ctx.scale(zoom * dpr, zoom * dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // ── Pass 1: Ground tiles ────────────────────────────────
      for (const { tx, ty, cx, cy, info } of tiles) {
        switch (info.ground) {
          case 'water':
            drawWater(ctx, cx, cy, time);
            break;
          case 'road':
            drawRoad(ctx, cx, cy, info.bridge ? undefined : tx, info.bridge ? undefined : ty);
            break;
          case 'park':
            diamond(ctx, cx, cy, PARK_COLOR);
            break;
          case 'hillside':
            diamond(ctx, cx, cy, HILL_A);
            break;
          default: {
            const shade = rng(tx, ty) > 0.5 ? GRASS_A : GRASS_B;
            diamond(ctx, cx, cy, shade);
            break;
          }
        }
      }

      for (const { tx, ty, cx, cy, info } of tiles) {
        if (info.ground !== 'water' && !info.bridge) drawQuay(ctx, tx, ty, cx, cy);
      }

      // Painter's order prevents distant buildings covering nearer ones.
      for (const { tx, ty, cx, cy, info } of tiles) {
        if (info.bridge === 'suspension') drawSuspensionBridge(ctx, cx, cy);
        else if (info.bridge === 'truss') drawTrussBridge(ctx, cx, cy);
        let sprite: number | null = null;
        if (info.cathedral) sprite = 14;
        else if (info.tree) sprite = 12;
        else if (info.ground === 'park') sprite = (tx + ty) % 3 === 0 ? 10 : 12;
        else if (info.building) {
          const options = { wealthy: [1, 5, 7], middle: [0, 2, 3, 6], lower: [0, 4, 6], tower: [4, 5, 8], civic: [7, 8, 9, 14] };
          const choices = options[info.building];
          sprite = choices[Math.floor(rng(tx, ty) * choices.length)];
          const centers = [{ id: 'shadyside', x: 22, y: 13 }, { id: 'lawrenceville', x: 19, y: 7 }, { id: 'homewood', x: 24, y: 17 }];
          const neighborhood = centers.sort((a, b) => Math.hypot(tx-a.x, ty-a.y) - Math.hypot(tx-b.x, ty-b.y))[0].id;
          const policy = policies.find(p => p.status === 'active' &&
            ['housing', 'environment', 'transit'].includes(p.category) &&
            (!p.affectedNeighborhoods.length || p.affectedNeighborhoods.includes(neighborhood)));
          // Representative project lots; no invented numerical simulation effects.
          if (policy && (tx + ty) % 7 === 0) {
            sprite = turn <= (policy.turnEnacted ?? turn) ? 11 :
              policy.category === 'environment' ? 13 : policy.category === 'transit' ? 15 : 4;
          }
        }
        if (sprite !== null) drawSprite(ctx, atlas, sprite, cx, cy);
        if (info.ground === 'road' && !info.bridge && (tx + ty) % 3 === 0) {
          const lx = cx - 34, ly = cy;
          ctx.fillStyle = '#344b47'; ctx.fillRect(lx, ly - 18, 2, 20);
          ctx.fillStyle = '#f3dca0'; ctx.fillRect(lx - 2, ly - 20, 6, 4);
          ctx.fillStyle = '#293d45'; ctx.fillRect(cx + 31, cy - 2, 2, 5);
          ctx.fillStyle = '#ce7454'; ctx.fillRect(cx + 30, cy - 5, 4, 4);
          ctx.fillStyle = '#e8bc8d'; ctx.fillRect(cx + 31, cy - 7, 2, 2);
        }
        if (info.ground === 'road' && !info.bridge && (tx + ty) % 5 === 0) {
          const progress = isPlaying ? (time * 0.16 + rng(tx, ty)) % 1 : rng(tx, ty);
          const alongX = classifyTile(tx + 1, ty).ground === 'road' || classifyTile(tx - 1, ty).ground === 'road';
          const vx = cx + (progress - 0.5) * TW * (alongX ? 1 : -1);
          const vy = cy + (progress - 0.5) * TH;
          ctx.fillStyle = ['#f2ca69', '#cf6654', '#d9e9e9'][tx % 3];
          fillPoly(ctx, [[vx-7,vy-3],[vx,vy-6],[vx+9,vy],[vx+2,vy+4]], ctx.fillStyle);
          ctx.fillStyle = '#263e50'; ctx.fillRect(vx-2, vy-3, 5, 3);
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, [pan.x, pan.y, zoom, atlas, policies, turn, isPlaying]);

  // ── Input handlers ───────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.hud-ctrl, button, [data-map-badge]')) return;
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
  const handleReset   = () => { setMapViewport({ x: -260, y: -90, zoom: 0.85 }); };

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

      {!atlas && <div className="absolute inset-0 grid place-items-center text-slate-200 bg-slate-900" role="status">
        {assetError ? 'City artwork could not load. Refresh to try again.' : 'Loading your illustrated city…'}
      </div>}
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
                data-map-badge
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.action(); } }}
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
