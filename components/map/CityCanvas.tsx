'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { createWalkers, drawWalker, walkerPosition, hitTestWalker } from './residentWalkers';
import { useCityPulseStore } from '@/lib/store';

// ============================================================
// CityCanvas — Procedural Isometric Pittsburgh City Renderer
// HTML5 Canvas 2D with an illustrated 4 × 4 sprite atlas.
// Art style: detailed illustrated indie city with individually placed sprites.
// Geography: Three Rivers confluence — Allegheny + Mon → Ohio.
// ============================================================

import {
  TW, TH, GW, GH, OX, OY, MAP_AREAS, LandmarkSprite,
  tileToScreen, rng,
  alleghenyY, monY, isAllegheny, isMon, isOhio, isWater, isInWedge,
  isBridge, CATHEDRAL_TX, CATHEDRAL_TY,
  classifyTile, TileInfo, BridgeKind, Zone,
  NEIGHBORHOOD_MARKERS, PITTSBURGH_LANDMARKS, PittsburghLandmark,
} from './cityMapData';

// ── Colors ───────────────────────────────────────────────────
// Bright pixel-art palette — no gradients anywhere.
const SKY_COLOR    = '#ded7c9';
const GRASS_A      = '#718e51';
const GRASS_B      = '#718e51';
const PARK_COLOR   = '#71964e';
const HILL_A       = '#6A9A50';
const WATER_COLOR  = '#567f99';
const WATER_SHINE  = '#b5d0dc';
const ROAD_COLOR   = '#59616a';

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

const landmarkCells: Record<LandmarkSprite, number> = { cathedral: 0, hospital: 1, police: 2, skyscraper: 3, office: 4, university: 5 };
function drawLandmarkSprite(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement, kind: LandmarkSprite, x: number, y: number) {
  const index = landmarkCells[kind];
  const sw = atlas.naturalWidth / 3, sh = atlas.naturalHeight / 2;
  const size = kind === 'cathedral' ? 190 : kind === 'skyscraper' ? 154 : kind === 'hospital' ? 145 : kind === 'office' ? 128 : 112;
  ctx.drawImage(atlas, (index % 3) * sw, Math.floor(index / 3) * sh, sw, sh,
    x - size / 2, y - size * 0.9 + TH * 0.45, size, size);
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
function drawRiverLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.font = '800 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(230,244,255,0.55)';
  ctx.strokeStyle = 'rgba(24,48,68,0.45)';
  ctx.lineWidth = 3;
  ctx.strokeText(label, 0, 0);
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

function drawLandmarkLabel(ctx: CanvasRenderingContext2D, label: string, x: number, top: number, width: number, color: string) {
  ctx.save();
  ctx.font = '900 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const bx = x - width / 2;
  ctx.fillStyle = 'rgba(12,24,38,0.88)';
  ctx.strokeStyle = 'rgba(255,184,28,0.65)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(bx, top, width, 18, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillText(label, x, top + 9);
  ctx.restore();
}

function drawPointFountain(ctx: CanvasRenderingContext2D, x: number, y: number) {
  fillPoly(ctx, [[x, y - 18], [x + 30, y - 4], [x, y + 12], [x - 30, y - 4]], '#3f7d4d', '#d7c28c');
  ctx.fillStyle = '#d9e6d7';
  ctx.beginPath();
  ctx.ellipse(x, y - 5, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8fc6dd';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 7);
  ctx.quadraticCurveTo(x - 14, y - 32, x - 3, y - 39);
  ctx.moveTo(x, y - 7);
  ctx.quadraticCurveTo(x + 14, y - 32, x + 3, y - 39);
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x, y - 43);
  ctx.stroke();
}

function drawStadium(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
  ctx.save();
  ctx.translate(x, y - 8);
  ctx.scale(1, 0.55);
  ctx.fillStyle = '#d9d4bd';
  ctx.strokeStyle = '#233246';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = label === 'PNC' ? '#3d8f4a' : '#2f5f9c';
  ctx.beginPath();
  ctx.ellipse(0, 0, 23, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (label !== 'PNC') {
    ctx.fillStyle = '#FFB81C';
    ctx.fillRect(x - 20, y - 27, 40, 5);
    ctx.fillRect(x - 20, y - 11, 40, 5);
  }
}

function drawIncline(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.strokeStyle = '#322b24';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 42, y + 22);
  ctx.lineTo(x + 24, y - 48);
  ctx.moveTo(x - 34, y + 26);
  ctx.lineTo(x + 32, y - 44);
  ctx.stroke();
  fillPoly(ctx, [[x - 12, y - 7], [x + 8, y - 17], [x + 20, y - 9], [x, y + 2]], '#FFB81C', '#6b3f15');
  ctx.fillStyle = '#17304f';
  ctx.fillRect(x + 1, y - 13, 8, 5);
  ctx.restore();
}

function drawLandmark(ctx: CanvasRenderingContext2D, landmark: PittsburghLandmark) {
  const { x, y } = tileToScreen(landmark.tx, landmark.ty);
  if (landmark.kind === 'point') {
    drawPointFountain(ctx, x, y);
    return;
  }
  if (landmark.kind === 'stadium') {
    drawStadium(ctx, x, y, landmark.label);
    return;
  }
  if (landmark.kind === 'incline') {
    drawIncline(ctx, x, y);
  }
}

function drawLandmarkLabels(ctx: CanvasRenderingContext2D) {
  const height = 18;
  const gap = 4;
  ctx.font = '900 10px system-ui, sans-serif';
  // Place the widest labels first, then move nearby labels just far enough to clear them.
  const labels = PITTSBURGH_LANDMARKS.map(landmark => ({
    landmark,
    width: Math.ceil(ctx.measureText(landmark.label).width) + 14,
  })).sort((a, b) => b.width - a.width);
  const placed: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  for (const { landmark, width } of labels) {
    const { x, y } = tileToScreen(landmark.tx, landmark.ty);
    const left = x - width / 2;
    const right = x + width / 2;
    const preferredTop = y - (landmark.kind === 'cathedral' ? 175 : landmark.kind === 'hospital' ? 118 : 58);
    const nearby = placed.filter(box => left < box.right + gap && right + gap > box.left);
    const candidates = [preferredTop, ...nearby.flatMap(box => [box.top - height - gap, box.bottom + gap])]
      .sort((a, b) => Math.abs(a - preferredTop) - Math.abs(b - preferredTop) || a - b);
    const top = candidates.find(candidate => nearby.every(box =>
      candidate + height + gap <= box.top || candidate >= box.bottom + gap)) ?? preferredTop;
    const color = landmark.kind === 'point' ? '#BFE7F3'
      : landmark.kind === 'stadium' || landmark.kind === 'incline' ? '#F7D35B'
      : landmark.kind === 'bridgeCluster' ? '#FFB81C' : '#F4E7C5';
    drawLandmarkLabel(ctx, landmark.label, x, top, width, color);
    placed.push({ left, right, top, bottom: top + height });
  }
}

export default function CityCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const residents = useCityPulseStore(s => s.residents);
  const selectResident = useCityPulseStore(s => s.selectResident);
  const walkers = useMemo(() => createWalkers(residents), [residents]);
  const walkingTimeRef = useRef(0);
  const hoveredWalkerRef = useRef<string | null>(null);
  const clickStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const walkerHitsRef = useRef<Array<{ id: string; x: number; y: number }>>([]);

  const selectedNeighborhoodId = useCityPulseStore(s => s.ui.selectedNeighborhoodId);
  const selectNeighborhood     = useCityPulseStore(s => s.selectNeighborhood);
  const setMapViewport         = useCityPulseStore(s => s.setMapViewport);
  const storeViewport          = useCityPulseStore(s => s.ui.mapViewport);

  const zoom = storeViewport.zoom;
  const pan = storeViewport;
  const setZoom = (value: number | ((z: number) => number)) => setMapViewport({ ...cameraRef.current, zoom: typeof value === 'function' ? value(cameraRef.current.zoom) : value });
  const cameraRef = useRef({ ...storeViewport });
  const badgeRefs = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const velocityRef = useRef({ x: 0, y: 0 });
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    cameraRef.current = { ...storeViewport };
    velocityRef.current = { x: 0, y: 0 };
  }, [storeViewport]);
  useEffect(() => () => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
  }, []);
  const [atlas, setAtlas] = useState<HTMLImageElement | null>(null);
  const [landmarkAtlas, setLandmarkAtlas] = useState<HTMLImageElement | null>(null);
  const [assetError, setAssetError] = useState(false);
  const policies = useCityPulseStore(s => s.policies);
  const turn = useCityPulseStore(s => s.city.turn);
  const isPlaying = useCityPulseStore(s => s.ui.isPlaying);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setAtlas(img);
    img.onerror = () => setAssetError(true);
    img.src = '/sprites/city-atlas.png';
    const landmarks = new Image();
    landmarks.onload = () => setLandmarkAtlas(landmarks);
    landmarks.onerror = () => setAssetError(true);
    landmarks.src = '/sprites/pittsburgh-landmarks.png';
    return () => { img.onload = null; img.onerror = null; landmarks.onload = null; landmarks.onerror = null; };
  }, []);
  const [hoveredBadge, setHoveredBadge] = useState<string | null>(null);
  // Issue 4 fix: track mount state to avoid hydration mismatch
  const [mounted, setMounted]         = useState(false);

  useEffect(() => { setMounted(true); }, []);


  // Center on neighborhood selection
  useEffect(() => {
    if (!selectedNeighborhoodId) return;
    const centers: Record<string, ReturnType<typeof tileToScreen>> = {
      golden_triangle: tileToScreen(12, 16),
      shadyside:      tileToScreen(22, 13),
      lawrenceville:  tileToScreen(20, 7),
      homewood:       tileToScreen(25, 18),
    };
    const c = centers[selectedNeighborhoodId];
    if (c) setMapViewport({ x: -c.x * 1.3, y: -c.y * 1.3, zoom: 1.3 });
  }, [selectedNeighborhoodId, setMapViewport]);

  // ── Render loop ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !atlas || !landmarkAtlas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const startT = performance.now();

    const updateSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = container.clientWidth  * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width  = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
      setMapViewport({ containerW: container.clientWidth, containerH: container.clientHeight });
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

    // Bake the detailed city once. Camera motion only composites this layer;
    // no sprite scaling, street classification or policy lookup per drag frame.
    const scene = document.createElement('canvas');
    scene.width = GW * TW + 192;
    scene.height = GH * TH + 320;
    const sceneCtx = scene.getContext('2d');
    const foreground = document.createElement('canvas');
    foreground.width = scene.width; foreground.height = scene.height;
    const foregroundCtx = foreground.getContext('2d');
    const labels = document.createElement('canvas');
    labels.width = scene.width; labels.height = scene.height;
    const labelsCtx = labels.getContext('2d');
    if (!sceneCtx || !foregroundCtx || !labelsCtx) { ro.disconnect(); return; }
    foregroundCtx.translate(scene.width / 2, scene.height / 2);
    labelsCtx.translate(scene.width / 2, scene.height / 2);
    drawLandmarkLabels(labelsCtx);
    {
      const ctx = sceneCtx;
      ctx.translate(scene.width / 2, scene.height / 2);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // ── Pass 1: Ground tiles ────────────────────────────────
      for (const { tx, ty, cx, cy, info } of tiles) {
        switch (info.ground) {
          case 'water':
            drawWater(ctx, cx, cy, 0);
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

      drawRiverLabel(ctx, 'OHIO', tileToScreen(3, 16).x, tileToScreen(3, 16).y + 3, -0.02);
      drawRiverLabel(ctx, 'ALLEGHENY', tileToScreen(21, alleghenyY(21)).x, tileToScreen(21, alleghenyY(21)).y, -0.22);
      drawRiverLabel(ctx, 'MONONGAHELA', tileToScreen(21, monY(21)).x, tileToScreen(21, monY(21)).y, 0.24);

      // Painter's order prevents distant buildings covering nearer ones.
      for (const { tx, ty, cx, cy, info } of tiles) {
        if (info.bridge === 'suspension') drawSuspensionBridge(ctx, cx, cy);
        else if (info.bridge === 'truss') drawTrussBridge(ctx, cx, cy);
        let sprite: number | null = null;
        if (info.landmarkSprite) {
          drawLandmarkSprite(ctx, landmarkAtlas, info.landmarkSprite, cx, cy);
          drawLandmarkSprite(foregroundCtx, landmarkAtlas, info.landmarkSprite, cx, cy);
        }
        else if (info.cathedral) sprite = 14;
        else if (info.tree) sprite = 12;
        else if (info.ground === 'park' && !info.tree && (tx + ty) % 11 === 0 && tx > 10) sprite = 13;
        else if (info.building) {
          const options = { wealthy: [1, 1, 1, 5], middle: [0, 2, 3, 6], lower: [0, 0, 4, 6], tower: [4, 5, 5, 2], civic: [7, 8, 9, 14] };
          const choices = options[info.building];
          sprite = choices[Math.floor(rng(tx, ty) * choices.length)];
          const centers = [{ id: 'golden_triangle', x: 12, y: 16 }, { id: 'shadyside', x: 22, y: 13 }, { id: 'lawrenceville', x: 20, y: 7 }, { id: 'homewood', x: 25, y: 18 }];
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
        if (sprite !== null) {
          drawSprite(ctx, atlas, sprite, cx, cy);
          drawSprite(foregroundCtx, atlas, sprite, cx, cy);
        }
        if (info.ground === 'road' && !info.bridge && (tx + ty) % 3 === 0) {
          const lx = cx - 34, ly = cy;
          ctx.fillStyle = '#344b47'; ctx.fillRect(lx, ly - 18, 2, 20);
          ctx.fillStyle = '#f3dca0'; ctx.fillRect(lx - 2, ly - 20, 6, 4);

        }
      }

      for (const landmark of PITTSBURGH_LANDMARKS) drawLandmark(ctx, landmark);
    }
    const foregroundPixels = foregroundCtx.getImageData(0, 0, foreground.width, foreground.height).data;
    const trafficTiles = tiles.filter(t => t.info.ground === 'road' && !t.info.bridge && (t.tx + t.ty) % 5 === 0).map(t => ({ ...t, alongX: classifyTile(t.tx + 1, t.ty).ground === 'road' || classifyTile(t.tx - 1, t.ty).ground === 'road' }));
    const openWater = tiles.filter(t => t.info.ground === 'water' && [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => classifyTile(t.tx + dx, t.ty + dy).ground === 'water'));
    const badgeWorld = Object.fromEntries(MAP_AREAS.map(area => [area.id, { x: area.x, y: area.y }]));
    let previousTime = performance.now();
    function render() {
      if (!ctx || !canvas) return;
      const now = performance.now();
      const dt = Math.min(32, now - previousTime);
      previousTime = now;
      const time = (now - startT) * 0.001;
      if (isPlaying) walkingTimeRef.current += dt / 1000;
      const camera = cameraRef.current;
      const velocity = velocityRef.current;
      if (!dragRef.current && (velocity.x || velocity.y)) {
        camera.x += velocity.x * dt;
        camera.y += velocity.y * dt;
        const friction = Math.exp(-dt / 85);
        velocity.x *= friction; velocity.y *= friction;
        if (Math.hypot(velocity.x, velocity.y) < 0.015) {
          velocity.x = 0; velocity.y = 0;
          setMapViewport({ ...camera });
        }
      }
      const cw = canvas.width, ch = canvas.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.fillStyle = SKY_COLOR;
      ctx.fillRect(0, 0, cw, ch);
      ctx.save();
      ctx.translate(cw / 2 + camera.x * dpr, ch / 2 + camera.y * dpr);
      ctx.scale(camera.zoom * dpr, camera.zoom * dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(scene, -scene.width / 2, -scene.height / 2);
      ctx.strokeStyle = WATER_SHINE;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.18 + Math.sin(time) * 0.08;
      ctx.beginPath();
      for (const { cx, cy } of openWater) {
        const drift = Math.sin(time * 0.5 + cx) * 4;
        ctx.moveTo(cx - 8 + drift, cy + 5); ctx.lineTo(cx + 8 + drift, cy + 5);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
      for (const { tx, ty, cx, cy, info, alongX } of trafficTiles) {
        if (info.ground === 'road' && !info.bridge && (tx + ty) % 5 === 0) {
          const progress = isPlaying ? (time * 0.16 + rng(tx, ty)) % 1 : rng(tx, ty);
          const vx = cx + (progress - 0.5) * TW * (alongX ? 1 : -1);
          const vy = cy + (progress - 0.5) * TH;
          ctx.fillStyle = ['#f2ca69', '#cf6654', '#d9e9e9'][tx % 3];
          fillPoly(ctx, [[vx-7,vy-3],[vx,vy-6],[vx+9,vy],[vx+2,vy+4]], ctx.fillStyle);
          ctx.fillStyle = '#263e50'; ctx.fillRect(vx-2, vy-3, 5, 3);
        }
      }
      const walkingTime = walkingTimeRef.current;
      const positions = walkers.map(walker => ({ walker, position: walkerPosition(walker, walkingTime) })).sort((a,b) => a.position.y-b.position.y);
      walkerHitsRef.current = positions.filter(({position}) => {
        const x = Math.round(position.x + foreground.width/2), y = Math.round(position.y-7 + foreground.height/2);
        return x >= 0 && y >= 0 && x < foreground.width && y < foreground.height && foregroundPixels[(y*foreground.width+x)*4+3] < 128;
      }).map(({walker,position}) => ({id:walker.resident.id, x:cw/dpr/2 + camera.x + position.x*camera.zoom, y:ch/dpr/2 + camera.y + (position.y-7)*camera.zoom}));
      for (const {walker, position} of positions) {
        drawWalker(ctx, walker, walkingTime);
        if (hoveredWalkerRef.current === walker.resident.id) {
          ctx.strokeStyle = '#f6d28e'; ctx.lineWidth = 1.5 / camera.zoom;
          ctx.beginPath(); ctx.ellipse(position.x,position.y+1,7,3,0,0,Math.PI*2); ctx.stroke();
        }
      }
      // Transparent building/tree silhouettes occlude pedestrians behind them.
      ctx.drawImage(foreground, -foreground.width / 2, -foreground.height / 2);
      ctx.drawImage(labels, -labels.width / 2, -labels.height / 2);
      const hovered = walkerHitsRef.current.some(hit => hit.id === hoveredWalkerRef.current) ? positions.find(item => item.walker.resident.id === hoveredWalkerRef.current) : undefined;
      if (hovered) {
        ctx.save(); ctx.translate(hovered.position.x,hovered.position.y-18); ctx.scale(1/camera.zoom,1/camera.zoom);
        ctx.font = '12px system-ui';
        const label = `${hovered.walker.resident.name} · ${hovered.walker.resident.age}`;
        const width = ctx.measureText(label).width+20;
        ctx.fillStyle='#102033';ctx.fillRect(-width/2,-26,width,24);
        ctx.strokeStyle='#d2b77f';ctx.lineWidth=1;ctx.strokeRect(-width/2,-26,width,24);
        ctx.fillStyle='#f5e9d2';ctx.textAlign='center';ctx.fillText(label,0,-10);ctx.restore();
      }
      for (const [id, position] of Object.entries(badgeWorld)) {
        const badge = badgeRefs.current.get(id);
        if (!badge) continue;
        badge.style.left = `${cw / dpr / 2 + camera.x + position.x * camera.zoom}px`;
        badge.style.top = `${ch / dpr / 2 + camera.y + position.y * camera.zoom}px`;
      }
      ctx.restore();
      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, [atlas, landmarkAtlas, policies, turn, isPlaying, setMapViewport, walkers]);

  // ── Input handlers ───────────────────────────────────────────
  const commitCamera = () => setMapViewport({ ...cameraRef.current });
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.isPrimary || (e.target as HTMLElement).closest('.hud-ctrl, button, select, [data-map-badge]')) return;
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    velocityRef.current = { x: 0, y: 0 };
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, time: performance.now() };
    clickStartRef.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = 'grabbing';
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      const rect = e.currentTarget.getBoundingClientRect();
      const overControl = (e.target as HTMLElement).closest('.hud-ctrl, button, select, [data-map-badge]');
      hoveredWalkerRef.current = overControl ? null : hitTestWalker(walkerHitsRef.current,e.clientX-rect.left,e.clientY-rect.top);
      e.currentTarget.style.cursor = hoveredWalkerRef.current ? 'pointer' : 'grab';
      return;
    }
    if (drag.id !== e.pointerId) return;
    const now = performance.now();
    const dt = Math.max(8, now - drag.time);
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (clickStartRef.current && Math.hypot(e.clientX-clickStartRef.current.x,e.clientY-clickStartRef.current.y)>5) clickStartRef.current.moved = true;
    cameraRef.current.x += dx;
    cameraRef.current.y += dy;
    velocityRef.current = { x: Math.max(-0.6, Math.min(0.6, dx / dt)), y: Math.max(-0.6, Math.min(0.6, dy / dt)) };
    dragRef.current = { id: drag.id, x: e.clientX, y: e.clientY, time: now };
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    if (e.type !== 'pointerup' || performance.now() - drag.time > 80) velocityRef.current = { x: 0, y: 0 };
    if (e.type === 'pointerup' && clickStartRef.current && !clickStartRef.current.moved) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX-rect.left, y = e.clientY-rect.top;
      const nearest = hitTestWalker(walkerHitsRef.current, x, y);
      if (nearest) selectResident(nearest);
      velocityRef.current = {x:0,y:0};
    }
    clickStartRef.current = null;
    dragRef.current = null;
    e.currentTarget.style.cursor = 'grab';
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!velocityRef.current.x && !velocityRef.current.y) commitCamera();
  };

  // Non-passive wheel listener permits trackpad zoom without scrolling the page.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      velocityRef.current = { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = e.clientY - rect.top - rect.height / 2;
      const camera = cameraRef.current;
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1);
      const nextZoom = Math.max(0.25, Math.min(3, camera.zoom * Math.exp(-delta * 0.0015)));
      const ratio = nextZoom / camera.zoom;
      camera.x = px - (px - camera.x) * ratio;
      camera.y = py - (py - camera.y) * ratio;
      camera.zoom = nextZoom;
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(() => setMapViewport({ ...cameraRef.current }), 120);
    };
    container.addEventListener('wheel', wheel, { passive: false });
    return () => container.removeEventListener('wheel', wheel);
  }, [setMapViewport]);
  const handleZoomIn  = () => setZoom(z => Math.min(3.0, z * 1.25));
  const handleZoomOut = () => setZoom(z => Math.max(0.25, z * 0.8));
  const handleReset = () => {
    const container = containerRef.current;
    const fit = container ? Math.min(container.clientWidth / 2800, container.clientHeight / 1560) * 0.96 : 0.4;
    setMapViewport({ x: 0, y: 30, zoom: fit });
  };

  // ── Neighborhood badge definitions ───────────────────────────
  // Tile centers match classifyTile zone assignments above
  const badges = MAP_AREAS.map(area => ({
    ...area, wx: area.x, wy: area.y,
    borderColor: area.color, textColor: area.color, bgColor: 'rgba(22,32,39,0.92)',
    tooltip: `Explore ${area.name} — ${area.subtitle}`,
    action: () => setMapViewport({ x: -area.x * 1.05, y: -area.y * 1.05 + 100, zoom: 1.05 }),
  }));

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden select-none cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none', background: SKY_COLOR }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { hoveredWalkerRef.current = null; }}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={handlePointerUp}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block pointer-events-none"
      />

      {(!atlas || !landmarkAtlas) && <div className="absolute inset-0 grid place-items-center text-slate-200 bg-slate-900" role="status">
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
            const isSelected = selectedNeighborhoodId === b.id;
            const isHovered  = hoveredBadge === b.id;
            return (
              <div
                data-map-badge
                ref={node => { if (node) badgeRefs.current.set(b.id, node); else badgeRefs.current.delete(b.id); }}
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

      <div className="hud-ctrl absolute top-3 right-3 z-20 rounded-lg border border-slate-600 bg-slate-900/95 px-3 py-2 text-xs text-slate-200">
        <label htmlFor="map-resident-picker" className="block mb-1 text-[10px] text-slate-400">{walkers.length} synthetic residents · {isPlaying ? 'Walking' : 'Paused — press Play'}</label>
        <select id="map-resident-picker" aria-label="Explore a resident" value="" onChange={e => selectResident(e.target.value)} className="w-44 bg-slate-900 text-slate-200 outline-none">
          <option value="" disabled>Explore a resident…</option>
          {residents.map(resident => <option key={resident.id} value={resident.id}>{resident.name} · {resident.age}</option>)}
        </select>
      </div>
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
        <span>Explore Pittsburgh · Drag to pan · Scroll to zoom</span>
      </div>
    </div>
  );
}
