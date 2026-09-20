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

/**
 * Unrounded inverse of tileToScreen. `screenToTile` below snaps to whole tiles,
 * which is right for picking a tile but wrong for continuous camera math.
 */
export function screenToTileExact(sx: number, sy: number) {
  const origin = tileToScreen(0, 0);
  const x = (sx - origin.x) / (TW / 2);
  const y = (sy - origin.y) / (TH / 2);
  return { tx: (x + y) / 2, ty: (y - x) / 2 };
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

export const POINT_TX = 7;
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
  return tx >= 8 && tx <= 10 && Math.abs(ty - 16) <= (tx - 8) * 0.5;
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
  if (tx >= POINT_TX || tx < 0) return false;
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
export const CATHEDRAL_TX = 21;
export const CATHEDRAL_TY = 18;
export const PNC_PARK_TX = 9;
export const PNC_PARK_TY = 10;
export const PNC_TOWER_TX = 14;
export const PNC_TOWER_TY = 15;
export const MT_WASHINGTON_TX = 14;
export const MT_WASHINGTON_TY = 27;

// ── Tile Classification ──────────────────────────────────────
export type Zone = 'wealthy' | 'middle' | 'lower' | 'tower' | 'civic';
export type LandmarkSprite = 'cathedral' | 'hospital' | 'police' | 'skyscraper' | 'office' | 'university';
export type BridgeKind = 'suspension' | 'truss';

export interface TileInfo {
  ground: 'grass' | 'road' | 'water' | 'park' | 'hillside';
  bridge?: BridgeKind;
  building?: Zone;
  cathedral?: true;
  landmarkSprite?: LandmarkSprite;
  hillElevation?: number; // 0-4 relative to flat
  tree?: boolean;
}

// A deliberately compressed geographic model: west is decreasing tx, north decreasing ty.
// The Strip is on the south/east bank of the Allegheny, alongside Downtown.
function classifyTileRaw(tx: number, ty: number): TileInfo {
  if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) return { ground: 'grass' };
  if (isPointPark(tx, ty)) return { ground: 'park' };
  if (isWater(tx, ty)) {
    const bridge = isBridge(tx, ty);
    return bridge ? { ground: 'road', bridge } : { ground: 'water' };
  }
  const r = rng(tx, ty);
  // Large landmarks occupy a small campus or plaza instead of sharing lots
  // with houses, trees, or another landmark sprite.
  if (tx >= PNC_PARK_TX - 1 && tx <= PNC_PARK_TX + 1 &&
      ty >= PNC_PARK_TY - 1 && ty <= PNC_PARK_TY + 1) return { ground: 'grass' };
  if (tx >= CATHEDRAL_TX - 1 && tx <= CATHEDRAL_TX + 1 &&
      ty >= CATHEDRAL_TY - 1 && ty <= CATHEDRAL_TY + 1) {
    return tx === CATHEDRAL_TX && ty === CATHEDRAL_TY
      ? { ground: 'grass', cathedral: true, landmarkSprite: 'cathedral' }
      : { ground: 'grass' };
  }
  if (tx >= 17 && tx <= 18 && ty >= 17 && ty <= 19) {
    return tx === 18 && ty === 18
      ? { ground: 'grass', landmarkSprite: 'hospital' }
      : { ground: 'grass' };
  }
  if (tx >= PNC_TOWER_TX - 1 && tx <= PNC_TOWER_TX &&
      ty >= PNC_TOWER_TY - 1 && ty <= PNC_TOWER_TY) return { ground: 'grass' };
  if (tx === 14 && ty === 17) return { ground: 'grass', landmarkSprite: 'police' };
  if ((tx === 20 || tx === 22) && ty === 19) return { ground: 'grass', landmarkSprite: 'university' };
  // Keep the incline on a hillside block south of the road at ty 23.
  if (tx >= MT_WASHINGTON_TX - 1 && tx <= MT_WASHINGTON_TX + 1 &&
      ty >= MT_WASHINGTON_TY - 2 && ty <= MT_WASHINGTON_TY) return { ground: 'hillside' };

  // Continuous bridge approaches and east-west avenues connect the districts.
  const bridgeApproach = (BRIDGE_TX.has(tx) && Math.abs(ty - alleghenyY(tx)) < 3.1)
    || (MON_BRIDGE_TX.has(tx) && Math.abs(ty - monY(tx)) < 3.1);
  if (bridgeApproach && !isInWedge(tx, ty)) return { ground: 'road' };

  if (isInWedge(tx, ty)) {
    // Dense Golden Triangle skyline, separated by streets and civic squares.
    if (tx <= 15) {
      if (ty === 16 || tx === 15) return { ground: 'road' };
      if (tx === 10 || (tx === 14 && ty === 18)) return { ground: 'park' };
      return { ground: 'grass', building: 'tower', landmarkSprite: r < 0.55 ? 'skyscraper' : 'office' };
    }
    // Business corridor / Strip District hugs the inside of the Allegheny.
    if (ty <= 13) {
      if (ty === 11 || tx === 17 || tx === 21 || tx === 24) return { ground: 'road' };
      if (r < 0.16) return { ground: 'park', tree: r < 0.06 };
      return { ground: 'grass', building: 'tower', landmarkSprite: 'office' };
    }
    // Oakland: big institutional lots and open Cathedral / campus lawns.
    if (tx >= 17 && tx <= 22 && ty >= 15 && ty <= 20) {
      if (ty === 16 || ty === 20 || tx === 19) return { ground: 'road' };
      if (ty === 18 || (tx === 21 && ty === 17)) return { ground: 'park' };
      return r < 0.35 ? { ground: 'park' } : { ground: 'grass', building: 'civic', landmarkSprite: 'university' };
    }
    // Schenley Park south/east of the university.
    if (tx >= 21 && tx <= 24 && ty >= 21) return { ground: 'park', tree: r < 0.42 };
    if (tx === 16 || tx === 23 || ty === 14 || ty === 18 || ty === 22 || tx === 26) return { ground: 'road' };
    return r < 0.22 ? { ground: 'park', tree: r < 0.1 } : { ground: 'grass', building: tx >= 24 ? 'wealthy' : 'middle' };
  }

  // North Shore and outer residential hills: fewer trees, legible housing blocks.
  if (tx === 6 && ty === 12) return { ground: 'grass' };
  if (tx === 3 || tx === 7 || tx === 11 || tx === 17 || tx === 22 || ty === 7 || ty === 12 || ty === 23) return { ground: 'road' };
  const hillside = ty > monY(tx) + 2;
  if (tx === 0 || ty === 0 || tx === GW - 1 || ty === GH - 1) return { ground: 'park', tree: r < 0.3 };
  if (r < 0.26) return { ground: hillside ? 'hillside' : 'park', tree: r < 0.12 };
  return { ground: hillside ? 'hillside' : 'grass', building: r < 0.6 ? 'wealthy' : 'middle' };
}

/**
 * `classifyTileRaw`'s hand-tuned rules leave a few short dead-end road stubs
 * (e.g. a bridge landing with a gap before the next through street) that
 * aren't reachable from the rest of the network. Cars/pedestrians build
 * their routes by walking the road graph, so a disconnected stub traps
 * anything spawned on it. This computes, once, the shortest non-water detour
 * from every disconnected stub back to the main network and force-classifies
 * that detour as road, so the whole map is one connected component.
 */
let roadOverrides: Set<string> | null = null;

function tileKeyXY(x: number, y: number) {
  return `${x},${y}`;
}

function computeRoadOverrides(): Set<string> {
  const isRoad = (x: number, y: number) => x >= 0 && y >= 0 && x < GW && y < GH && classifyTileRaw(x, y).ground === 'road';

  const visited = new Set<string>();
  const components: Array<Array<{ x: number; y: number }>> = [];
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const key = tileKeyXY(x, y);
      if (!isRoad(x, y) || visited.has(key)) continue;
      const tiles: Array<{ x: number; y: number }> = [];
      const stack = [{ x, y }];
      visited.add(key);
      while (stack.length) {
        const cur = stack.pop()!;
        tiles.push(cur);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cur.x + dx, ny = cur.y + dy;
          const nk = tileKeyXY(nx, ny);
          if (isRoad(nx, ny) && !visited.has(nk)) { visited.add(nk); stack.push({ x: nx, y: ny }); }
        }
      }
      components.push(tiles);
    }
  }
  if (components.length <= 1) return new Set();

  components.sort((a, b) => b.length - a.length);
  const main = new Set(components[0].map(t => tileKeyXY(t.x, t.y)));
  const overrides = new Set<string>();

  for (let i = 1; i < components.length; i++) {
    const island = new Set(components[i].map(t => tileKeyXY(t.x, t.y)));
    // 0/1 BFS (Dijkstra with only edge weights 0 or 1): weight 0 to step onto
    // an existing road tile, weight 1 to carve a new one. Landmarks/water
    // (without a bridge) are never touched.
    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const deque: string[] = [];
    for (const t of components[i]) { const k = tileKeyXY(t.x, t.y); dist.set(k, 0); deque.push(k); }

    let reached: string | null = null;
    while (deque.length) {
      const cur = deque.shift()!;
      if (main.has(cur) || overrides.has(cur)) { reached = cur; break; }
      const [cx, cy] = cur.split(',').map(Number);
      const curDist = dist.get(cur)!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const nk = tileKeyXY(nx, ny);
        const info = classifyTileRaw(nx, ny);
        if (info.ground === 'water' && !info.bridge) continue;
        if (info.landmarkSprite || info.cathedral) continue;
        const stepCost = info.ground === 'road' ? 0 : 1;
        const nextDist = curDist + stepCost;
        if (dist.has(nk) && dist.get(nk)! <= nextDist) continue;
        dist.set(nk, nextDist);
        prev.set(nk, cur);
        if (stepCost === 0) deque.unshift(nk); else deque.push(nk);
      }
    }

    if (!reached) continue; // no reachable detour (fully boxed in by water) — leave as-is
    let node: string | undefined = reached;
    while (node && !island.has(node)) {
      if (!main.has(node)) overrides.add(node);
      node = prev.get(node);
    }
  }
  return overrides;
}

export function classifyTile(tx: number, ty: number): TileInfo {
  const raw = classifyTileRaw(tx, ty);
  if (raw.ground === 'road') return raw;
  if (!roadOverrides) roadOverrides = computeRoadOverrides();
  return roadOverrides.has(tileKeyXY(tx, ty)) ? { ground: 'road' } : raw;
}

// These are navigation areas, not renamed simulation neighborhoods.
export const MAP_AREAS = [
  { id: 'downtown', name: 'DOWNTOWN', subtitle: 'Golden Triangle · skyline', tx: 12, ty: 19, color: '#f4d28a' },
  { id: 'corporate', name: 'CORPORATE DISTRICT', subtitle: 'Strip District · offices & commerce', tx: 19, ty: 10, color: '#9bd4e1' },
  { id: 'pitt', name: 'PITT / OAKLAND', subtitle: 'University · Cathedral · UPMC', tx: 21, ty: 21, color: '#afbbe9' },
  { id: 'suburbs', name: 'SUBURBS', subtitle: 'Residential hills & garden streets', tx: 6, ty: 6, color: '#c4d7a0' },
].map(area => ({ ...area, ...tileToScreen(area.tx, area.ty) }));

export type LandmarkKind = 'point' | 'stadium' | 'pncPark' | 'pncTower' | 'incline' | 'cathedral' | 'hospital' | 'police' | 'bridgeCluster';

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
  { id: 'upmc', label: 'UPMC HOSPITAL', kind: 'hospital', tx: 18, ty: 18, wx: tileToScreen(18,18).x, wy: tileToScreen(18,18).y },
  { id: 'police', label: 'POLICE', kind: 'police', tx: 14, ty: 17, wx: tileToScreen(14,17).x, wy: tileToScreen(14,17).y },
  { id: 'point-state-park', label: 'POINT', kind: 'point', tx: 9, ty: POINT_TY, wx: tileToScreen(9, POINT_TY).x, wy: tileToScreen(9, POINT_TY).y },
  { id: 'acrisure-stadium', label: 'ACRISURE', kind: 'stadium', tx: 6, ty: 12, wx: tileToScreen(6, 12).x, wy: tileToScreen(6, 12).y },
  { id: 'pnc-park', label: 'PNC PARK', kind: 'pncPark', tx: PNC_PARK_TX, ty: PNC_PARK_TY, wx: tileToScreen(PNC_PARK_TX, PNC_PARK_TY).x, wy: tileToScreen(PNC_PARK_TX, PNC_PARK_TY).y },
  { id: 'pnc-tower', label: 'PNC TOWER', kind: 'pncTower', tx: PNC_TOWER_TX, ty: PNC_TOWER_TY, wx: tileToScreen(PNC_TOWER_TX, PNC_TOWER_TY).x, wy: tileToScreen(PNC_TOWER_TX, PNC_TOWER_TY).y },
  { id: 'three-sisters', label: '3 SISTERS', kind: 'bridgeCluster', tx: 12, ty: 11, wx: tileToScreen(12, 11).x, wy: tileToScreen(12, 11).y },
  { id: 'mt-washington', label: 'MT. WASHINGTON', kind: 'incline', tx: MT_WASHINGTON_TX, ty: MT_WASHINGTON_TY, wx: tileToScreen(MT_WASHINGTON_TX, MT_WASHINGTON_TY).x, wy: tileToScreen(MT_WASHINGTON_TX, MT_WASHINGTON_TY).y },
  { id: 'cathedral-learning', label: 'CATHEDRAL OF LEARNING', kind: 'cathedral', tx: CATHEDRAL_TX, ty: CATHEDRAL_TY, wx: tileToScreen(CATHEDRAL_TX, CATHEDRAL_TY).x, wy: tileToScreen(CATHEDRAL_TX, CATHEDRAL_TY).y },
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
