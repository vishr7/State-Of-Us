import { drawProtest } from '../animations/protest';
'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import NextImage from 'next/image';
import { createWalkers, drawWalker, walkerPosition, hitTestWalker } from './residentWalkers';
import { useCityPulseStore } from '@/lib/store';
import { drawCar } from './carSprite';
import { useAnimationStore, tileKey } from '../animations/store';
import { drawDemolition, DEMOLITION_IMPACT_MS, DEMOLITION_DURATION_MS } from '../animations/demolition';

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
const SKY_COLOR    = '#aac4cf';
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
  fill: string | CanvasGradient,
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
  // The second atlas row contains the bottom tips of the row above it.
  // Trim only that narrow strip and keep the building's scale and anchor.
  const trim = index >= 3 ? 26 : 0;
  const trimOnMap = trim / sh * size;
  ctx.drawImage(atlas, (index % 3) * sw, Math.floor(index / 3) * sh + trim, sw, sh - trim,
    x - size / 2, y - size * 0.9 + TH * 0.45 + trimOnMap, size, size - trimOnMap);
}

function drawStandaloneLandmark(ctx: CanvasRenderingContext2D, sprite: HTMLImageElement, x: number, y: number, width: number) {
  const height = width * sprite.naturalHeight / sprite.naturalWidth;
  ctx.drawImage(sprite, x - width / 2, y - height + TH / 2, width, height);
}

// A small setback keeps the illustrated ground diamonds inside their lots.
// Roofs and tree canopies can rise above the lot without shrinking the art.
function lotSetback(tx: number, ty: number) {
  const blocked = (dx: number, dy: number) => {
    const ground = classifyTile(tx + dx, ty + dy).ground;
    return ground === 'road' || ground === 'water';
  };
  return {
    x: (Number(blocked(-1, 0)) - Number(blocked(1, 0)) + Number(blocked(0, 1)) - Number(blocked(0, -1))) * 5,
    y: (Number(blocked(-1, 0)) - Number(blocked(1, 0)) - Number(blocked(0, 1)) + Number(blocked(0, -1))) * 2.5,
  };
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

function drawStadium(ctx: CanvasRenderingContext2D, x: number, y: number) {
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
  ctx.fillStyle = '#2f5f9c';
  ctx.beginPath();
  ctx.ellipse(0, 0, 23, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#FFB81C';
  ctx.fillRect(x - 20, y - 27, 40, 5);
  ctx.fillRect(x - 20, y - 11, 40, 5);
}

function drawLandmark(ctx: CanvasRenderingContext2D, landmark: PittsburghLandmark) {
  const { x, y } = tileToScreen(landmark.tx, landmark.ty);
  if (landmark.kind === 'point') {
    drawPointFountain(ctx, x, y);
    return;
  }
  if (landmark.kind === 'stadium') {
    drawStadium(ctx, x, y);
    return;
  }
}

type FrontEdge = { ax: number; ay: number; bx: number; by: number; water: boolean; side: 'left' | 'right' };

function frontMapEdges(): FrontEdge[] {
  const edges: FrontEdge[] = [];
  for (let ty = 0; ty < GH; ty++) {
    const tx = GW - 1;
    const { x, y } = tileToScreen(tx, ty);
    edges.push({ ax: x + TW / 2, ay: y, bx: x, by: y + TH / 2,
      water: classifyTile(tx, ty).ground === 'water', side: 'right' });
  }
  for (let tx = 0; tx < GW; tx++) {
    const ty = GH - 1;
    const { x, y } = tileToScreen(tx, ty);
    edges.push({ ax: x - TW / 2, ay: y, bx: x, by: y + TH / 2,
      water: classifyTile(tx, ty).ground === 'water', side: 'left' });
  }
  return edges;
}

function drawWaterfallEdges(ctx: CanvasRenderingContext2D, edges: FrontEdge[], time: number) {
  const depth = 48;
  for (const edge of edges) {
    if (!edge.water) continue;
    const midY = (edge.ay + edge.by) / 2;
    const face = ctx.createLinearGradient(0, midY, 0, midY + depth);
    face.addColorStop(0, WATER_COLOR);
    face.addColorStop(0.55, '#47718c');
    face.addColorStop(1, '#385f78');
    fillPoly(ctx, [[edge.ax, edge.ay], [edge.bx, edge.by],
      [edge.bx, edge.by + depth], [edge.ax, edge.ay + depth]], face);

    ctx.save();
    ctx.strokeStyle = 'rgba(190,218,227,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(edge.ax, edge.ay + 1);
    ctx.lineTo(edge.bx, edge.by + 1);
    ctx.stroke();

    // The same short, sparse highlights used on the river surface continue
    // down the front face, with a slight motion as water passes the edge.
    for (let i = 1; i <= 6; i++) {
      const t = i / 7;
      const x = edge.ax + (edge.bx - edge.ax) * t;
      const y = edge.ay + (edge.by - edge.ay) * t;
      const drift = (time * 13 + i * 11 + x * 0.17) % 15;
      ctx.strokeStyle = i % 2 ? 'rgba(194,221,231,0.48)' : 'rgba(156,197,214,0.38)';
      ctx.lineWidth = i % 3 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 5 + drift);
      ctx.lineTo(x, y + Math.min(depth - 5, 24 + drift));
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawRockyEdges(ctx: CanvasRenderingContext2D, edges: FrontEdge[]) {
  for (const [index, edge] of edges.entries()) {
    if (edge.water) continue;
    ctx.save();
    const depth = 88;
    const point = (t: number, z: number): [number, number] =>
      [edge.ax + (edge.bx-edge.ax)*t, edge.ay + (edge.by-edge.ay)*t + z];
    const outline = [point(0,0), point(1,0), point(1,depth), point(.72,depth-7), point(.44,depth+4), point(.2,depth-5), point(0,depth)];
    fillPoly(ctx, outline, edge.side === 'left' ? '#737b79' : '#566773');
    ctx.beginPath(); outline.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.clip();
    // Staggered, fractured strata: short uneven slabs instead of vertical stripes.
    const palette = edge.side === 'left'
      ? ['#8b9087','#737e7d','#a0a294','#637477','#858e88']
      : ['#607783','#758791','#536b79','#88969a','#647c87'];
    for (let row = 0; row < 6; row++) {
      const z = 7 + row * 14;
      for (let col = -1; col < 4; col++) {
        const seed = index * 43 + col * 7;
        const noise = rng(seed,row+11);
        const t = col / 3 + (row % 2) * .16;
        const end = t + .28 + noise * .12;
        const top = z + noise * 5;
        const slab = [point(t,top),point(end,top-2),point(end-.04,top+9),point(t+.08,top+14),point(t-.02,top+8)];
        fillPoly(ctx, slab, palette[Math.floor(noise * palette.length)]);
        const [x,y] = point(t,top); const [x2,y2] = point(end,top-2);
        ctx.strokeStyle = '#d4cbb24a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x2,y2); ctx.stroke();
        ctx.strokeStyle = '#293e4d85'; ctx.lineWidth = .9;
        const crack = [point(end,top),point(end-.04,top+6),point(end-.01,top+12),point(end-.1,top+15)];
        ctx.beginPath(); crack.forEach(([cx,cy],i) => i ? ctx.lineTo(cx,cy) : ctx.moveTo(cx,cy)); ctx.stroke();
      }
    }
    // Soil cap, broken moss patches and trailing vegetation.
    fillPoly(ctx,[point(0,0),point(1,0),point(1,4),point(.6,6),point(0,4)],'#525b43');
    for (let j = 0; j < 9; j++) {
      const t=j/9, random=rng(index+80,j);
      if(random < .3) continue;
      fillPoly(ctx,[point(t,0),point(t+.12,0),point(t+.09,4+random*10),point(t+.04,3+random*15)],random>.7?'#71834c':'#506947');
    }
    ctx.restore();
  }
}

function mapDiamond() {
  const topTile = tileToScreen(0, 0);
  const rightTile = tileToScreen(GW - 1, 0);
  const bottomTile = tileToScreen(GW - 1, GH - 1);
  const leftTile = tileToScreen(0, GH - 1);
  return [
    { x: 0, y: topTile.y - TH / 2 },
    { x: rightTile.x + TW / 2, y: rightTile.y },
    { x: 0, y: bottomTile.y + TH / 2 },
    { x: leftTile.x - TW / 2, y: leftTile.y },
  ];
}

type CloudAsset = 'tall' | 'wide' | 'puff';
type CloudPlacement = { x: number; y: number; width: number; asset: CloudAsset; flip?: boolean; opacity?: number };

const CLOUD_ASSETS: Record<CloudAsset, { src: string; width: number; height: number }> = {
  tall: { src: '/sprites/cloud-bank-tall.png', width: 1774, height: 887 },
  wide: { src: '/sprites/cloud-sunlit.png', width: 1774, height: 887 },
  puff: { src: '/sprites/cloud-puff.png', width: 1536, height: 1024 },
};

function edgeCloud(side: number, t: number, offset: number, width: number,
  asset: CloudAsset, flip = false, opacity = 1): CloudPlacement {
  const corners = mapDiamond();
  const a = corners[side];
  const b = corners[(side + 1) % corners.length];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  return {
    x: a.x + dx * t + dy / length * offset,
    y: a.y + dy * t - dx / length * offset,
    width, asset, flip, opacity,
  };
}

// Draw the outer bank first, then tuck a dense inner bank under the terrain.
// Overlap the opaque cloud cores, not just their transparent sprite bounds.
const BACK_CLOUDS: CloudPlacement[] = [3, 2, 1, 0].flatMap(layer =>
  [0,1,2,3].flatMap(side =>
    Array.from({ length: 15 }, (_, i) => {
      const variation = rng(side * 31 + i, layer + 90);
      return edgeCloud(side, (i - 0.5) / 13,
        layer === 0 ? 15 + variation * 25 : layer * 205 + variation * 40,
        640 + layer * 100 + variation * 140, 'wide', i % 2 === 0, 1);
    })));

const FRONT_CLOUDS: CloudPlacement[] = [1,2].flatMap(side =>
  Array.from({ length: 10 }, (_, i) => {
    const cloud = edgeCloud(side, i / 9, 55 + (i % 3) * 20,
      540 + (i % 3) * 65, 'wide', i % 2 === 0);
    return { ...cloud, y: cloud.y + 65 };
  }));

function CloudSprites({ placements }: { placements: CloudPlacement[] }) {
  return placements.map((cloud, index) => {
    const asset = CLOUD_ASSETS[cloud.asset];
    return (
      <NextImage
        key={`${cloud.asset}-${index}`}
        src={asset.src}
        alt=""
        width={asset.width}
        height={asset.height}
        unoptimized
        draggable={false}
        className="absolute pointer-events-none max-w-none select-none"
        style={{
          left: cloud.x,
          top: cloud.y,
          width: cloud.width,
          height: 'auto',
          opacity: cloud.opacity ?? 1,
          transform: `translate(-50%, -50%) scaleX(${cloud.flip ? -1 : 1})`,
        }}
      />
    );
  });
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
    const preferredTop = y - (landmark.kind === 'pncTower' ? 190 : landmark.kind === 'cathedral' ? 175
      : landmark.kind === 'hospital' ? 118 : landmark.kind === 'incline' ? 182
      : landmark.kind === 'pncPark' ? 142 : 58);
    const nearby = placed.filter(box => left < box.right + gap && right + gap > box.left);
    const candidates = [preferredTop, ...nearby.flatMap(box => [box.top - height - gap, box.bottom + gap])]
      .sort((a, b) => Math.abs(a - preferredTop) - Math.abs(b - preferredTop) || a - b);
    const top = candidates.find(candidate => nearby.every(box =>
      candidate + height + gap <= box.top || candidate >= box.bottom + gap)) ?? preferredTop;
    const color = landmark.kind === 'point' ? '#BFE7F3'
      : landmark.kind === 'stadium' || landmark.kind === 'pncPark' || landmark.kind === 'pncTower' || landmark.kind === 'incline' ? '#F7D35B'
      : landmark.kind === 'bridgeCluster' ? '#FFB81C' : '#F4E7C5';
    drawLandmarkLabel(ctx, landmark.label, x, top, width, color);
    placed.push({ left, right, top, bottom: top + height });
  }
}

export default function CityCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const backCloudRef = useRef<HTMLDivElement>(null);
  const frontCloudRef = useRef<HTMLDivElement>(null);
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
  const [mtWashingtonSprite, setMtWashingtonSprite] = useState<HTMLImageElement | null>(null);
  const [pncParkSprite, setPncParkSprite] = useState<HTMLImageElement | null>(null);
  const [pncTowerSprite, setPncTowerSprite] = useState<HTMLImageElement | null>(null);
  const [assetError, setAssetError] = useState(false);
  const replacements = useAnimationStore(s => s.replacements);
  const removedBuildings = useAnimationStore(s => s.removed);
  const demolition = useAnimationStore(s => s.queue[0]);
  const demolitionClock = useRef<{ id: string; start: number } | null>(null);
  const activeEvents = useCityPulseStore(s => s.activeEvents);
  useEffect(() => {
    for (const event of activeEvents) {
      if (event.resolved || !/\bdemoli(?:tion|sh|shed)\b/i.test(event.title)) continue;
      const center = NEIGHBORHOOD_MARKERS.find(marker => event.affectedNeighborhoods.includes(marker.id));
      const candidates: { tx: number; ty: number; distance: number }[] = [];
      for (let ty = 0; ty < GH; ty++) for (let tx = 0; tx < GW; tx++) {
        const info = classifyTile(tx, ty);
        if (info.building && !info.tree && !info.cathedral && !info.landmarkSprite && !useAnimationStore.getState().removed[tileKey(tx, ty)])
          candidates.push({ tx, ty, distance: Math.hypot(tx - (center?.tx ?? 12), ty - (center?.ty ?? 16)) });
      }
      const target = candidates.sort((a, b) => a.distance - b.distance)[0];
      if (target) useAnimationStore.getState().demolish({ id: event.id, tx: target.tx, ty: target.ty });
    }
  }, [activeEvents]);
  useEffect(() => {
    if (!demolition) return;
    const target = tileToScreen(demolition.tx, demolition.ty);
    setMapViewport({ x: -target.x * cameraRef.current.zoom, y: -target.y * cameraRef.current.zoom });
  }, [demolition?.id, setMapViewport]);
  const policies = useCityPulseStore(s => s.policies);
  const turn = useCityPulseStore(s => s.city.turn);
  // Street life (people, cars) is ambient. It used to follow `ui.isPlaying`, but the daily-agenda
  // flow retired turn autoplay (nothing sets it any more), which froze everyone in place.
  const [ambientMotion, setAmbientMotion] = useState(true);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setAmbientMotion(!query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setAtlas(img);
    img.onerror = () => setAssetError(true);
    img.src = '/sprites/city-atlas.png';
    const landmarks = new Image();
    landmarks.onload = () => setLandmarkAtlas(landmarks);
    landmarks.onerror = () => setAssetError(true);
    landmarks.src = '/sprites/pittsburgh-landmarks.png';
    const mtWashington = new Image();
    mtWashington.onload = () => setMtWashingtonSprite(mtWashington);
    mtWashington.onerror = () => setAssetError(true);
    mtWashington.src = '/sprites/mt-washington.png';
    const pncPark = new Image();
    pncPark.onload = () => setPncParkSprite(pncPark);
    pncPark.onerror = () => setAssetError(true);
    pncPark.src = '/sprites/pnc-park.png';
    const pncTower = new Image();
    pncTower.onload = () => setPncTowerSprite(pncTower);
    pncTower.onerror = () => setAssetError(true);
    pncTower.src = '/sprites/pnc-tower.png';
    return () => { img.onload = null; img.onerror = null; landmarks.onload = null; landmarks.onerror = null; mtWashington.onload = null; mtWashington.onerror = null; pncPark.onload = null; pncPark.onerror = null; pncTower.onload = null; pncTower.onerror = null; };
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
    if (!canvas || !container || !atlas || !landmarkAtlas || !mtWashingtonSprite || !pncParkSprite || !pncTowerSprite) return;
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
    const mapEdges = frontMapEdges();

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
      // Keep the fog beneath the land so only a narrow exterior bank shows.
      drawRockyEdges(ctx, mapEdges);
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
        if (removedBuildings[tileKey(tx, ty)]) continue;
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
        if (replacements[tileKey(tx, ty)] !== undefined) sprite = replacements[tileKey(tx, ty)];
        if (sprite !== null) {
          const setback = lotSetback(tx, ty);
          drawSprite(ctx, atlas, sprite, cx + setback.x, cy + setback.y);
          drawSprite(foregroundCtx, atlas, sprite, cx + setback.x, cy + setback.y);
        }
      }

      for (const landmark of PITTSBURGH_LANDMARKS) {
        if (landmark.kind === 'incline') {
          const { x, y } = tileToScreen(landmark.tx, landmark.ty);
          drawStandaloneLandmark(ctx, mtWashingtonSprite, x, y, 205);
          drawStandaloneLandmark(foregroundCtx, mtWashingtonSprite, x, y, 205);
        } else if (landmark.kind === 'pncPark' || landmark.kind === 'pncTower') {
          const { x, y } = tileToScreen(landmark.tx, landmark.ty);
          const image = landmark.kind === 'pncPark' ? pncParkSprite : pncTowerSprite;
          const width = landmark.kind === 'pncPark' ? 205 : 145;
          drawStandaloneLandmark(ctx, image, x, y, width);
          drawStandaloneLandmark(foregroundCtx, image, x, y, width);
        } else {
          drawLandmark(ctx, landmark);
        }
      }
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
      if (ambientMotion) walkingTimeRef.current += dt / 1000;
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
      ctx.clearRect(0, 0, cw, ch);
      const cloudTransform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
      if (backCloudRef.current) backCloudRef.current.style.transform = cloudTransform;
      if (frontCloudRef.current) frontCloudRef.current.style.transform = cloudTransform;
      ctx.save();
      ctx.translate(cw / 2 + camera.x * dpr, ch / 2 + camera.y * dpr);
      ctx.scale(camera.zoom * dpr, camera.zoom * dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(scene, -scene.width / 2, -scene.height / 2);
      drawWaterfallEdges(ctx, mapEdges, time);
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
          const progress = ambientMotion ? (time * 0.16 + rng(tx, ty)) % 1 : rng(tx, ty);
          const vx = cx + (progress - 0.5) * TW * (alongX ? 1 : -1);
          const vy = cy + (progress - 0.5) * TH;
          drawCar(ctx, vx, vy, alongX, (tx + ty * 3) % 4);
        }
      }
      const walkingTime = walkingTimeRef.current;
      const positions = walkers.map(walker => ({ walker, position: walkerPosition(walker, walkingTime) })).sort((a,b) => a.position.y-b.position.y);
      walkerHitsRef.current = positions.filter(({position}) => {
        const x = Math.round(position.x + foreground.width/2), y = Math.round(position.y-7 + foreground.height/2);
        return x >= 0 && y >= 0 && x < foreground.width && y < foreground.height && foregroundPixels[(y*foreground.width+x)*4+3] < 128;
      }).map(({walker,position}) => ({id:walker.resident.id, x:cw/dpr/2 + camera.x + position.x*camera.zoom, y:ch/dpr/2 + camera.y + (position.y-7)*camera.zoom}));
      const focusMark = focusMarkRef.current && now < focusMarkRef.current.until ? focusMarkRef.current : null;
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
      const protestState = useCityPulseStore.getState();
      if (protestState.city.turn === 4) {
        const district = NEIGHBORHOOD_MARKERS.find(n => n.name.toLowerCase() === 'homewood');
        if (district) {
          ctx.save();
          const shade = ctx.createRadialGradient(district.wx, district.wy, 20, district.wx, district.wy, 145);
          shade.addColorStop(0, '#020917dd'); shade.addColorStop(.65, '#020917aa'); shade.addColorStop(1, '#02091700');
          ctx.fillStyle = shade; ctx.fillRect(district.wx-145,district.wy-145,290,290);
          ctx.fillStyle = '#ffcd71'; ctx.textAlign = 'center'; ctx.font = 'bold 12px sans-serif';
          ctx.fillText('⚡ LOCAL POWER FAILURE', district.wx, district.wy-70);
          ctx.font = '9px sans-serif'; ctx.fillText('Affected lower-income households', district.wx, district.wy-55);
          ctx.strokeStyle = '#ffcd7188'; ctx.setLineDash([5,6]); ctx.lineWidth=2;
          ctx.beginPath();ctx.ellipse(district.wx,district.wy,110,55,0,0,Math.PI*2);ctx.stroke();
          ctx.restore();
        }
      }

      if (protestState.city.turn === 2) {
        const downtown = tileToScreen(CATHEDRAL_TX + 1, CATHEDRAL_TY + 1);
        if (downtown) drawProtest(ctx, downtown.x, downtown.y + 45, time, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      }
      // "Find on map" marker: drawn over the foreground so a resident who walks behind a building can still be found.
      const focused = focusMark ? positions.find(item => item.walker.resident.id === focusMark.id) : undefined;
      if (focused) {
        const { x, y } = focused.position;
        const pulse = 0.5 + 0.5 * Math.sin(time * 6);
        ctx.strokeStyle = `rgba(255,214,120,${0.6 + pulse * 0.4})`; ctx.lineWidth = 1.8 / camera.zoom;
        ctx.beginPath(); ctx.ellipse(x, y + 1, 8 + pulse * 2.5, 3.4 + pulse, 0, 0, Math.PI * 2); ctx.stroke();
        const bob = Math.sin(time * 5) * 1.5;
        ctx.fillStyle = '#ffd678'; ctx.strokeStyle = '#3b2a10'; ctx.lineWidth = 0.8 / camera.zoom;
        ctx.beginPath(); ctx.moveTo(x, y - 20 + bob); ctx.lineTo(x - 3.4, y - 25.5 + bob); ctx.lineTo(x + 3.4, y - 25.5 + bob); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      const segment = useAnimationStore.getState().queue[0];
      if (segment) {
        if (demolitionClock.current?.id !== segment.id) demolitionClock.current = { id: segment.id, start: performance.now() };
        const elapsed = performance.now() - demolitionClock.current.start;
        const target = tileToScreen(segment.tx, segment.ty);
        drawDemolition(ctx, target.x, target.y, elapsed, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        if (elapsed >= DEMOLITION_IMPACT_MS && !useAnimationStore.getState().removed[tileKey(segment.tx, segment.ty)]) useAnimationStore.getState().impact(segment);
        if (elapsed >= DEMOLITION_DURATION_MS) useAnimationStore.getState().finish(segment.id);
      }

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
  }, [atlas, landmarkAtlas, mtWashingtonSprite, pncParkSprite, pncTowerSprite, policies, turn, ambientMotion, setMapViewport, walkers, removedBuildings, replacements]);

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
  const tour = useCityPulseStore(s => s.announcements[0]?.tour);
  useEffect(() => {
    if (!tour) return;
    const container = containerRef.current;
    if (!container) return;
    const demo = tour === 'demo-house' || tour === 'demo-result';
    let demoLot: { tx: number; ty: number } | undefined;
    if (demo) {
      for (let ty = 3; ty < 12 && !demoLot; ty++) for (let tx = 3; tx < 12 && !demoLot; tx++) {
        const tile = classifyTile(tx, ty);
        if (tile.building === 'middle' && !tile.tree && !tile.landmarkSprite && !tile.cathedral) demoLot = { tx, ty };
      }
    }
    const focusTour = tour === 'outage' ? 'district:Homewood' : tour;
    const marker = focusTour.startsWith('district:') ? NEIGHBORHOOD_MARKERS.find(n => n.name.toLowerCase() === focusTour.slice(9).toLowerCase() || n.id === focusTour.slice(9).toLowerCase().replaceAll(' ', '_')) : undefined;
    const area = tour === 'protest' ? tileToScreen(CATHEDRAL_TX + 1, CATHEDRAL_TY + 1) : demoLot ? tileToScreen(demoLot.tx, demoLot.ty) : marker ? { x: marker.wx, y: marker.wy } : MAP_AREAS.find(a => a.id === (tour === 'protest' ? 'downtown' : tour));
    const fit = Math.min(container.clientWidth / 2800, container.clientHeight / 1560) * .96;
    const z = area ? (tour === 'protest' || tour === 'outage') ? 1.8 : demo ? 1.65 : Math.min(1.05, fit * 2) : fit;
    const target = area ? { x: -area.x * z, y: -area.y * z - container.clientHeight * .12, zoom: z } : { x: 0, y: 30, zoom: z };
    const start = { ...cameraRef.current };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const began = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - began) / 1800);
      const ease = t * t * (3 - 2 * t);
      setMapViewport({ x: start.x + (target.x - start.x) * ease, y: start.y + (target.y - start.y) * ease, zoom: start.zoom + (target.zoom - start.zoom) * ease });
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    const timer = tour === 'demo-house' && demoLot ? setTimeout(() => {
      useAnimationStore.getState().demolish({ id: 'intro-house-replacement', ...demoLot!, replacement: 1 });
    }, 2200) : undefined;
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [tour, setMapViewport]);

  // "Find on map" (e.g. from the Featured Resident card): fly to the resident and mark them for a few seconds.
  const mapFocus = useCityPulseStore(s => s.mapFocus);
  const walkersRef = useRef(walkers);
  walkersRef.current = walkers;
  const focusMarkRef = useRef<{ id: string; until: number } | null>(null);
  useEffect(() => {
    if (!mapFocus) return;
    const container = containerRef.current;
    const walker = walkersRef.current.find(w => w.resident.id === mapFocus.residentId);
    if (!container || !walker) return;
    const start = { ...cameraRef.current };
    const targetZoom = Math.max(1.3, start.zoom);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const began = performance.now();
    const until = began + 6000;
    focusMarkRef.current = { id: walker.resident.id, until };
    // Fly there, then stay locked on (they keep walking) until the marker fades or the user takes the camera.
    let following = true;
    const release = () => { following = false; };
    container.addEventListener('pointerdown', release, { capture: true, once: true });
    container.addEventListener('wheel', release, { passive: true, once: true });
    let frame = 0;
    const animate = (now: number) => {
      if (!following) return;
      const t = reduced ? 1 : Math.min(1, (now - began) / 1300);
      const ease = t * t * (3 - 2 * t);
      const zoom = start.zoom + (targetZoom - start.zoom) * ease;
      // Aim at where they are NOW, not where they were when clicked: residents keep walking during the flight.
      const p = walkerPosition(walker, walkingTimeRef.current);
      const target = { x: -p.x * zoom, y: -(p.y - 7) * zoom - container.clientHeight * 0.08 };
      setMapViewport({ x: start.x + (target.x - start.x) * ease, y: start.y + (target.y - start.y) * ease, zoom });
      if (now < until) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener('pointerdown', release, { capture: true });
      container.removeEventListener('wheel', release);
    };
  }, [mapFocus, setMapViewport]);

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
      className="w-full h-full relative isolate overflow-hidden select-none cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none', background: `linear-gradient(180deg, #75b6df 0%, ${SKY_COLOR} 56%, #b7d3e5 100%)` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => { hoveredWalkerRef.current = null; }}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={handlePointerUp}
    >
      <div
        aria-hidden="true"
        ref={backCloudRef}
        className="absolute left-1/2 top-1/2 z-0 h-0 w-0 pointer-events-none"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
      >
        <CloudSprites placements={BACK_CLOUDS} />
      </div>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10 w-full h-full block pointer-events-none"
      />
      <div
        aria-hidden="true"
        ref={frontCloudRef}
        className="absolute left-1/2 top-1/2 z-20 h-0 w-0 pointer-events-none"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }}
      >
        <CloudSprites placements={FRONT_CLOUDS} />
      </div>

      {(!atlas || !landmarkAtlas || !mtWashingtonSprite || !pncParkSprite || !pncTowerSprite) && <div className="absolute inset-0 z-50 grid place-items-center text-slate-200 bg-slate-900" role="status">
        {assetError ? 'City artwork could not load. Refresh to try again.' : 'Loading your illustrated city…'}
      </div>}
      {/* Neighborhood badges — only rendered client-side (avoids hydration mismatch) */}
      {mounted && (
        <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
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

      <div className="hud-ctrl absolute top-3 right-3 z-40 rounded-lg border border-slate-600 bg-slate-900/95 px-3 py-2 text-xs text-slate-200">
        <label htmlFor="map-resident-picker" className="block mb-1 text-[10px] text-slate-400">{walkers.length} synthetic residents{ambientMotion ? '' : ' · Motion reduced'}</label>
        <select id="map-resident-picker" aria-label="Explore a resident" value="" onChange={e => selectResident(e.target.value)} className="w-44 bg-slate-900 text-slate-200 outline-none">
          <option value="" disabled>Explore a resident…</option>
          {residents.map(resident => <option key={resident.id} value={resident.id}>{resident.name} · {resident.age}</option>)}
        </select>
      </div>
      {/* HUD controls */}
      <div className="hud-ctrl absolute bottom-4 right-4 flex items-center gap-1.5 z-40">
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
        className="hud-ctrl absolute top-[166px] left-4 px-3 py-1.5 rounded-lg text-xs hidden md:flex items-center gap-2 pointer-events-none z-40 backdrop-blur-md"
        style={{ background: 'rgba(10,22,40,0.85)', border: '1px solid rgba(30,48,80,0.7)', color: '#94A3B8' }}
      >
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <span>Explore Pittsburgh · Drag to pan · Scroll to zoom</span>
      </div>
    </div>
  );
}
