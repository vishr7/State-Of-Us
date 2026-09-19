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
// The Point (river confluence) is at tile (9, 16).
// Allegheny flows from upper-right (NE) toward The Point.
// Monongahela flows from lower-right (SE) toward The Point.
// Ohio flows from The Point to the left (W).

export const POINT_TX = 9;
export const POINT_TY = 16;

export function alleghenyY(tx: number) {
  const dx = tx - POINT_TX;
  return POINT_TY - dx * 0.48 + Math.sin(dx * 0.55) * 0.25;
}

export function monY(tx: number) {
  const dx = tx - POINT_TX;
  return POINT_TY + dx * 0.52 + Math.sin(dx * 0.45) * 0.2;
}

export function isPointPark(tx: number, ty: number) {
  return tx >= 9 && tx <= 11 && ty >= 15 && ty <= 17;
}

export function isAllegheny(tx: number, ty: number) {
  if (tx < POINT_TX || tx > 27) return false;
  return Math.abs(ty - alleghenyY(tx)) < 1.35;
}

export function isMon(tx: number, ty: number) {
  if (tx < POINT_TX || tx > 27) return false;
  return Math.abs(ty - monY(tx)) < 1.35;
}

export function isOhio(tx: number, ty: number) {
  if (tx >= POINT_TX || tx < 1) return false;
  return Math.abs(ty - POINT_TY) < 2.15;
}

export function isWater(tx: number, ty: number) {
  if (isPointPark(tx, ty)) return false;
  return isAllegheny(tx, ty) || isMon(tx, ty) || isOhio(tx, ty);
}

// Tiles between Allegheny and Mon (the Golden Triangle wedge)
export function isInWedge(tx: number, ty: number) {
  if (tx < POINT_TX || tx > 27) return false;
  return ty > alleghenyY(tx) + 0.65 && ty < monY(tx) - 0.65;
}

// Stylized river crossings. The first three Allegheny bridges read as the
// Three Sisters, with later East End crossings toward Lawrenceville.
export const BRIDGE_TX = new Set([10, 12, 14, 17, 22]);
export const MON_BRIDGE_TX = new Set([10, 13, 18, 24]);

export function isBridge(tx: number, ty: number) {
  if (BRIDGE_TX.has(tx) && isAllegheny(tx, ty)) return 'suspension' as const;
  if (MON_BRIDGE_TX.has(tx) && isMon(tx, ty)) return 'truss' as const;
  return null;
}

// Cathedral of Learning: special single tile in Oakland
export const CATHEDRAL_TX = 18;
export const CATHEDRAL_TY = 15;

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
  if (isPointPark(tx, ty)) return { ground: 'park' };

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

  const northBank = ty < alleghenyY(tx) - 0.7;
  const southBank = ty > monY(tx) + 0.7;
  const downtownCore = isInWedge(tx, ty) && tx <= 15;

  // North Shore: stadiums and riverfront parkland opposite Downtown.
  if (tx >= 4 && tx <= 14 && northBank) {
    if (tx === 7 || tx === 11 || ty === Math.round(alleghenyY(tx)) - 2) return { ground: 'road' };
    if ((tx === 6 && ty === 12) || (tx === 9 && ty === 12)) return { ground: 'grass', building: 'civic' };
    if (tx <= 10 && r > 0.35) return { ground: 'park', tree: r > 0.7 };
    return { ground: 'grass', building: r > 0.55 ? 'middle' : 'civic' };
  }

  // Downtown sits inside the Golden Triangle, dense at the Point and thinning east.
  if (downtownCore) {
    if (tx === 10 || tx === 12 || tx === 14 || ty === 16) return { ground: 'road' };
    if (tx === 12 && ty === 15) return { ground: 'park' };
    return { ground: 'grass', building: tx <= 12 ? 'tower' : (r < 0.35 ? 'civic' : 'tower') };
  }

  if (tx === CATHEDRAL_TX && ty === CATHEDRAL_TY) return { ground: 'grass', cathedral: true };

  // Lawrenceville and the Strip District run along the north bank of the Allegheny.
  if (tx >= 15 && northBank) {
    if ([17, 22].includes(tx) || ty === Math.round(alleghenyY(tx)) - 2) return { ground: 'road' };
    if (tx >= 18 && tx <= 20 && ty <= Math.round(alleghenyY(tx)) - 3) return { ground: 'park', tree: true };
    return r < 0.15 ? { ground: 'grass', tree: true } : { ground: 'grass', building: 'middle' };
  }

  // Oakland and Shadyside occupy the East End between the rivers.
  if (tx >= 16 && tx <= 25 && ty >= 12 && ty <= 17) {
    if ([18, 22].includes(tx) || ty === 14) return { ground: 'road' };
    if (tx >= 21 && ty <= 15) {
      if ((tx + ty) % 4 === 0) return { ground: 'park', tree: true };
      return { ground: 'grass', building: 'wealthy' };
    }
    if (tx >= 16 && tx <= 19 && ty >= 15 && ty <= 16) return { ground: 'park' };
    return { ground: 'grass', building: 'middle' };
  }

  // Homewood sits farther east, away from the riverfront boom.
  if (tx >= 22 && tx <= 27 && ty >= 15 && ty <= 21) {
    if (tx === 24 || ty === 18) return { ground: 'road' };
    if (tx === 25 && ty >= 16 && ty <= 17) return { ground: 'park' };
    if (r < 0.22) return { ground: 'park', tree: true };
    return { ground: 'grass', building: 'lower' };
  }

  // South Side and Mt. Washington climb the southern bank above the Mon.
  if (tx >= POINT_TX && southBank) {
    if ([11, 13, 18, 24].includes(tx) || ty === 23) return { ground: 'road' };
    if (r < 0.42 || ty > 24) return { ground: 'hillside', tree: true };
    return { ground: 'hillside', building: tx <= 15 ? 'wealthy' : 'middle' };
  }

  // East End infill between the main named neighborhoods.
  if (isInWedge(tx, ty)) {
    if ([16, 20, 24].includes(tx) || [13, 18].includes(ty)) return { ground: 'road' };
    return r < 0.25 ? { ground: 'park', tree: true } : { ground: 'grass', building: 'middle' };
  }
  return r < 0.35 ? { ground: 'park' } : { ground: 'grass', building: 'middle' };
}

export type LandmarkKind = 'point' | 'stadium' | 'incline' | 'cathedral' | 'bridgeCluster';

export interface PittsburghLandmark {
  id: string;
  label: string;
  kind: LandmarkKind;
  tx: number;
  ty: number;
  wx: number;
  wy: number;
}

export const PITTSBURGH_LANDMARKS: PittsburghLandmark[] = [
  { id: 'point-state-park', label: 'POINT', kind: 'point', tx: POINT_TX, ty: POINT_TY, wx: tileToScreen(POINT_TX, POINT_TY).x, wy: tileToScreen(POINT_TX, POINT_TY).y },
  { id: 'acrisure-stadium', label: 'ACRISURE', kind: 'stadium', tx: 6, ty: 12, wx: tileToScreen(6, 12).x, wy: tileToScreen(6, 12).y },
  { id: 'pnc-park', label: 'PNC', kind: 'stadium', tx: 9, ty: 12, wx: tileToScreen(9, 12).x, wy: tileToScreen(9, 12).y },
  { id: 'three-sisters', label: '3 SISTERS', kind: 'bridgeCluster', tx: 12, ty: 11, wx: tileToScreen(12, 11).x, wy: tileToScreen(12, 11).y },
  { id: 'mt-washington', label: 'MT. WASHINGTON', kind: 'incline', tx: 12, ty: 23, wx: tileToScreen(12, 23).x, wy: tileToScreen(12, 23).y },
  { id: 'cathedral-learning', label: 'CATHEDRAL', kind: 'cathedral', tx: CATHEDRAL_TX, ty: CATHEDRAL_TY, wx: tileToScreen(CATHEDRAL_TX, CATHEDRAL_TY).x, wy: tileToScreen(CATHEDRAL_TX, CATHEDRAL_TY).y },
];

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
    tx: 12,
    ty: 16,
    wx: tileToScreen(12, 16).x,
    wy: tileToScreen(12, 16).y,
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
    tx: 22,
    ty: 13,
    wx: tileToScreen(22, 13).x,
    wy: tileToScreen(22, 13).y,
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
    tx: 20,
    ty: 7,
    wx: tileToScreen(20, 7).x,
    wy: tileToScreen(20, 7).y,
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
    tx: 25,
    ty: 18,
    wx: tileToScreen(25, 18).x,
    wy: tileToScreen(25, 18).y,
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
