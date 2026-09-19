// ============================================================
// cityMapData.ts — Shared Pittsburgh City Map Geometry & Math
// Defines isometric grid, river confluence curves, bridge math,
// per-tile classification, and neighborhood positions shared
// between CityCanvas and MiniMap.
// ============================================================

export const TW = 96;     // tile width (px)
export const TH = 48;     // tile height (px) = TW/2
export const GW = 28;     // grid columns
export const GH = 28;     // grid rows

// World origin is centered on the grid midpoint tile (14,14)
export const OX = 0;
export const OY = -((GW / 2 + GH / 2) * (TH / 2)); // ≈ -672

export function tileToScreen(tx: number, ty: number) {
  return { x: (tx - ty) * (TW / 2) + OX, y: (tx + ty) * (TH / 2) + OY };
}

export function screenToTile(sx: number, sy: number) {
  const x = (sx - OX) / (TW / 2);
  const y = (sy - OY) / (TH / 2);
  return {
    tx: Math.round((x + y) / 2),
    ty: Math.round((y - x) / 2),
  };
}

// Stable per-tile pseudo-random in [0,1)
export function rng(tx: number, ty: number): number {
  let seed = Math.imul(tx + 71, 374761393) ^ Math.imul(ty + 137, 668265263);
  seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
  return ((seed ^ (seed >>> 16)) >>> 0) / 4294967296;
}

// ── Pittsburgh River Math ────────────────────────────────────
// The Point (river confluence) is at tile (10, 16).
// Allegheny flows from upper-right (NE) toward The Point.
// Monongahela flows from lower-right (SE) toward The Point.
// Ohio flows from The Point to the left (W).

export function alleghenyY(tx: number) { return 16 - (tx - 10) * 10 / 16; }
export function monY(tx: number)       { return 16 + (tx - 10) * 6  / 16; }

export function isAllegheny(tx: number, ty: number) {
  if (tx < 10 || tx > 27) return false;
  return Math.abs(ty - alleghenyY(tx)) < 1.7;
}

export function isMon(tx: number, ty: number) {
  if (tx < 10 || tx > 27) return false;
  return Math.abs(ty - monY(tx)) < 1.7;
}

export function isOhio(tx: number, ty: number) {
  if (tx >= 10 || tx < 1) return false;
  return Math.abs(ty - 16) < 2;
}

export function isWater(tx: number, ty: number) {
  return isAllegheny(tx, ty) || isMon(tx, ty) || isOhio(tx, ty);
}

// Tiles between Allegheny and Mon (the Golden Triangle wedge)
export function isInWedge(tx: number, ty: number) {
  if (tx < 10 || tx > 27) return false;
  return ty > alleghenyY(tx) + 0.5 && ty < monY(tx) - 0.5;
}

// Stylized Three Sisters crossings aligned with the street grid.
export const BRIDGE_TX = new Set([11, 15, 19]);
// Truss crossings over the Mon.
export const MON_BRIDGE_TX = new Set([15, 23]);

export function isBridge(tx: number, ty: number) {
  if (BRIDGE_TX.has(tx) && isAllegheny(tx, ty)) return 'suspension' as const;
  if (MON_BRIDGE_TX.has(tx) && isMon(tx, ty)) return 'truss' as const;
  return null;
}

// Cathedral of Learning: special single tile in Oakland
export const CATHEDRAL_TX = 20;
export const CATHEDRAL_TY = 14;

// ── Tile Classification ──────────────────────────────────────
export type Zone = 'wealthy' | 'middle' | 'lower' | 'tower' | 'civic';
export type BridgeKind = 'suspension' | 'truss';

export interface TileInfo {
  ground: 'grass' | 'road' | 'water' | 'park' | 'hillside';
  bridge?: BridgeKind;
  building?: Zone;
  cathedral?: true;
  hillElevation?: number; // 0-4 relative to flat
  tree?: boolean;
}

export function classifyTile(tx: number, ty: number): TileInfo {
  // Water (checked first — rivers override everything)
  if (isWater(tx, ty)) {
    const b = isBridge(tx, ty);
    return b ? { ground: 'road', bridge: b } : { ground: 'water' };
  }

  const r = rng(tx, ty);
  // Wooded perimeter softens the edge of the model
  if (tx === 0 || ty === 0 || tx === GW - 1 || ty === GH - 1) {
    return { ground: 'park', tree: true };
  }

  // Shadyside: garden neighborhood
  if (tx <= 10 && ty <= 13) {
    if (tx === 2 || tx === 9 || ty === 3 || ty === 12 || (ty === 8 && tx >= 9)) return { ground: 'road' };
    if (tx >= 5 && tx <= 7 && ty >= 6 && ty <= 9) return { ground: 'park' };
    if ((tx + ty) % 3 === 0 || tx === 1 || ty === 1) return { ground: 'grass', tree: true };
    return { ground: 'grass', building: 'wealthy' };
  }

  // Main avenues tie the districts to the river crossings
  if ([11, 15, 19, 23].includes(tx)) return { ground: 'road' };
  if ([3, 8, 13, 18, 24].includes(ty)) return { ground: 'road' };
  if (tx < 11 && (tx === 4 || tx === 8 || ty === 21)) return { ground: 'road' };

  if (tx === CATHEDRAL_TX && ty === CATHEDRAL_TY) return { ground: 'grass', cathedral: true };

  // Downtown: compact masonry apartment blocks around civic square
  if (isInWedge(tx, ty) && tx < 22) {
    if (tx >= 16 && tx <= 18 && ty >= 15 && ty <= 16) return { ground: 'park' };
    if (tx === 17 && ty === 14) return { ground: 'grass', cathedral: true };
    return { ground: 'grass', building: r < 0.18 ? 'middle' : 'tower' };
  }

  // Homewood: rowhouse blocks, community gardens
  if (isInWedge(tx, ty) && tx >= 22) {
    if (tx === 25 && ty >= 16 && ty <= 17) return { ground: 'park' };
    return { ground: 'grass', building: 'lower' };
  }

  // Lawrenceville: active mixed-use riverfront
  if (ty < alleghenyY(tx) && tx >= 11) {
    if (tx >= 16 && tx <= 18 && ty >= 5 && ty <= 7) return { ground: 'park' };
    return r < 0.12 ? { ground: 'grass', tree: true } : { ground: 'grass', building: 'middle' };
  }

  // Hillside cottages gradually give way to woodland on the southern bank
  if (tx >= 10 && ty > monY(tx)) {
    if (r < 0.5 || ty > 25) return { ground: 'hillside', tree: true };
    return { ground: 'hillside', building: 'wealthy' };
  }
  return r < 0.35 ? { ground: 'park' } : { ground: 'grass', building: 'middle' };
}

// ── Neighborhood Definitions ─────────────────────────────────
export interface NeighborhoodMarker {
  id: string;
  name: string;
  short: string;
  subtitle: string;
  tx: number;
  ty: number;
  wx: number;
  wy: number;
  color: string;
  borderColor: string;
  bgColor: string;
  tooltip: string;
}

export const NEIGHBORHOOD_MARKERS: NeighborhoodMarker[] = [
  {
    id: 'golden_triangle',
    name: 'DOWNTOWN',
    short: 'DT',
    subtitle: 'City Center',
    tx: 17,
    ty: 14,
    wx: tileToScreen(17, 14).x,
    wy: tileToScreen(17, 14).y,
    color: '#f2e6ce',
    borderColor: '#d4c3a3',
    bgColor: 'rgba(43,38,34,0.94)',
    tooltip: 'Golden Triangle — Downtown Pittsburgh',
  },
  {
    id: 'shadyside',
    name: 'SHADYSIDE',
    short: 'SH',
    subtitle: 'Wealthy',
    tx: 6,
    ty: 7,
    wx: tileToScreen(6, 7).x,
    wy: tileToScreen(6, 7).y,
    color: '#FFD166',
    borderColor: '#FFB81C',
    bgColor: 'rgba(14,28,10,0.93)',
    tooltip: 'Shadyside — Wealthy | 81% Happiness | $94K Median Income',
  },
  {
    id: 'lawrenceville',
    name: 'LAWRENCEVILLE',
    short: 'LV',
    subtitle: 'Middle-Income',
    tx: 19,
    ty: 7,
    wx: tileToScreen(19, 7).x,
    wy: tileToScreen(19, 7).y,
    color: '#93C5FD',
    borderColor: '#60A5FA',
    bgColor: 'rgba(8,18,40,0.93)',
    tooltip: 'Lawrenceville — Middle-Income | 68% Happiness | $52K Median Income',
  },
  {
    id: 'homewood',
    name: 'HOMEWOOD',
    short: 'HW',
    subtitle: 'Lower-Income',
    tx: 24,
    ty: 17,
    wx: tileToScreen(24, 17).x,
    wy: tileToScreen(24, 17).y,
    color: '#FCA5A5',
    borderColor: '#F87171',
    bgColor: 'rgba(28,8,8,0.93)',
    tooltip: 'Homewood — Lower-Income | 42% Happiness | $28K Median Income',
  },
];

// World bounds for bounding boxes & coordinate mapping
export const WORLD_BOUNDS = {
  minX: -1380,
  maxX: 1380,
  minY: -740,
  maxY: 700,
  width: 2760,
  height: 1440,
};
