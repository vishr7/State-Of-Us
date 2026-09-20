import type { Resident } from '@/lib/types';
import { GW, GH, classifyTile, tileToScreen } from './cityMapData';

type Tile = { x: number; y: number };
type Appearance = {
  skin: string; hair: string; bottoms: string; accent: string;
  hairstyle: number; beanie: boolean; glasses: boolean; skirt: boolean; jacket: boolean;
};
export type Walker = { resident: Resident; route: Tile[]; phase: number; speed: number; appearance: Appearance };

// Seed cosmetics separately from navigation, using the entire resident ID.
// A person's look stays the same when the resident list is reordered.
function appearanceFor(id: string): Appearance {
  let seed = 2166136261;
  for (const char of id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (colors: string[]) => colors[Math.floor(random() * colors.length)];
  return {
    skin: pick(['#f1c9a5', '#d9a27c', '#b77e58', '#88583e', '#593d32']),
    hair: pick(['#29282d', '#593c2d', '#a66539', '#cfb16b', '#b9b9b3']),
    bottoms: pick(['#29394d', '#45658a', '#685d79', '#806951', '#41685e']),
    accent: pick(['#d76255', '#e8b957', '#629a89', '#9477ae', '#5683ab']),
    hairstyle: Math.floor(random() * 4),
    beanie: random() < 0.35,
    glasses: random() < 0.36,
    skirt: random() < 0.35,
    jacket: random() < 0.4,
  };
}
const centers: Record<string, Tile> = { shadyside: { x: 24, y: 15 }, homewood: { x: 24, y: 17 }, lawrenceville: { x: 19, y: 7 }, golden_triangle: { x: 12, y: 16 } };
export function isWalkable(x: number, y: number) {
  if (x < 0 || y < 0 || x >= GW || y >= GH) return false;
  const tile = classifyTile(x, y);
  return tile.ground === 'road' && !tile.bridge;
}
export function createWalkers(residents: Resident[], limit = 100): Walker[] {
  const streets: Tile[] = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (isWalkable(x, y)) streets.push({ x, y });
  return residents.slice(0, limit).map((resident, index) => {
    let seed = index + 1;
    for (const char of resident.id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const center = centers[resident.neighborhood] ?? centers.lawrenceville;
    const nearby = [...streets].sort((a, b) => Math.hypot(a.x-center.x, a.y-center.y) - Math.hypot(b.x-center.x, b.y-center.y)).slice(0, 16);
    const route = [nearby[Math.floor(random() * nearby.length)]];
    for (let step = 0; step < 24; step++) {
      const last = route[route.length-1], previous = route[route.length-2];
      const neighbors = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({ x:last.x+dx, y:last.y+dy })).filter(p => isWalkable(p.x,p.y));
      const forward = neighbors.filter(p => !previous || p.x !== previous.x || p.y !== previous.y);
      const choices = forward.length ? forward : neighbors;
      if (!choices.length) break;
      route.push(choices[Math.floor(random()*choices.length)]);
    }
    // Retrace the same path so loops never teleport across buildings or rivers.
    const loop = route.length > 1 ? [...route, ...route.slice(1,-1).reverse()] : route;
    return { resident, route: loop, phase: random() * loop.length, speed: 0.15 + random()*0.12, appearance: appearanceFor(resident.id) };
  });
}
export function walkerPosition(walker: Walker, seconds: number) {
  const progress = walker.phase + seconds * walker.speed;
  const index = Math.floor(progress) % walker.route.length;
  const a = walker.route[index], b = walker.route[(index+1)%walker.route.length];
  const fraction = progress % 1;
  const position = tileToScreen(a.x + (b.x-a.x)*fraction + 0.39, a.y + (b.y-a.y)*fraction + 0.39);
  return { ...position, facing: b.x-b.y >= a.x-a.y ? 1 : -1, stride: Math.sin(seconds * 8 + walker.phase) * 1.5 };
}
// Draws one resident, feet at the origin and facing right. The map animates `stride`; a portrait passes 0.
function drawResidentSprite(ctx: CanvasRenderingContext2D, resident: Pick<Resident, 'portraitColor'>, look: Appearance, stride: number) {
  ctx.fillStyle = '#10232e55'; ctx.beginPath(); ctx.ellipse(0,1,4,1.6,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = look.skirt ? look.skin : look.bottoms; ctx.lineWidth = look.skirt ? 1.3 : 1.8;
  ctx.beginPath();ctx.moveTo(-1,-4);ctx.lineTo(-1+stride,-0.5);ctx.moveTo(1,-4);ctx.lineTo(1-stride,-0.5);ctx.stroke();
  ctx.fillStyle = '#25313b';
  ctx.fillRect(-1.8+stride,-1,2.3,1.2);ctx.fillRect(0.2-stride,-1,2.3,1.2);

  // Hair behind the shoulders gives longer styles a distinct silhouette.
  ctx.fillStyle = look.hair;
  if (look.hairstyle === 1) ctx.fillRect(-2.5,-12,4.8,5.5);
  if (look.hairstyle === 2) ctx.fillRect(-3.5,-12,2,4);
  ctx.fillStyle = resident.portraitColor;ctx.fillRect(-2.5,-9,5,5.5);
  ctx.fillStyle = look.jacket ? look.accent : resident.portraitColor;
  ctx.fillRect(-3,-8.5,1.3,3.5);ctx.fillRect(2,-8.5,1.3,3.5);
  ctx.fillStyle = look.skin;
  ctx.fillRect(-3,-5+stride*0.35,1.2,1.4);ctx.fillRect(2,-5-stride*0.35,1.2,1.4);
  if (look.jacket) {
    ctx.fillStyle = look.accent;
    ctx.fillRect(-2.5,-9,1.7,5.5);ctx.fillRect(1,-9,1.5,5.5);
    ctx.fillStyle = '#e6ded0';ctx.fillRect(-0.3,-8.5,0.6,4.5);
  }
  ctx.fillStyle = look.bottoms;
  if (look.skirt) {
    ctx.beginPath();ctx.moveTo(-2.2,-5.2);ctx.lineTo(2.2,-5.2);
    ctx.lineTo(3.4,-2);ctx.lineTo(-3.4,-2);ctx.closePath();ctx.fill();
    ctx.fillStyle = '#ffffff30';ctx.fillRect(-1.3,-4.8,0.7,2.5);
  } else {
    ctx.fillRect(-2.3,-4.5,4.6,1.3);
  }

  ctx.fillStyle = look.skin;ctx.fillRect(-2,-13,4,4);
  ctx.fillRect(1.7,-11.3,0.8,1); // Small nose makes the facing direction readable.
  ctx.fillStyle = look.hair;
  ctx.fillRect(-2,-14,4,1.7);
  ctx.fillRect(-2,-12.5,0.8,1.8);
  if (look.hairstyle === 3) { ctx.fillRect(-2.5,-14.5,5,1.5);ctx.fillRect(-1.5,-15,3,1); }
  if (look.beanie) {
    ctx.fillStyle = look.accent;
    ctx.fillRect(-2,-15.2,4,2.6);ctx.fillRect(-1.2,-16,2.4,1.2);
    ctx.fillRect(-2.7,-13.4,5.4,1.1);
    ctx.fillStyle = '#fff1d1';ctx.fillRect(0.8,-13.3,0.8,0.8);
  }
  if (look.glasses) {
    ctx.fillStyle = '#25313b';
    ctx.fillRect(-1.8,-11.9,1.7,1.5);ctx.fillRect(0.5,-11.9,1.7,1.5);
    ctx.fillRect(-0.2,-11.6,0.9,0.5);
    ctx.fillStyle = '#c5e1e3';
    ctx.fillRect(-1.3,-11.6,0.8,0.6);ctx.fillRect(1,-11.6,0.8,0.6);
  } else {
    ctx.fillStyle = '#343033';ctx.fillRect(1,-11.7,0.6,0.8);
  }
}

/** Reuse the map citizen artwork in decorative scenes without creating a game resident. */
export function drawCitizen(ctx: CanvasRenderingContext2D, id: string, portraitColor: string, stride = 0) {
  drawResidentSprite(ctx, { portraitColor }, appearanceFor(id), stride);
}

export function drawWalker(ctx: CanvasRenderingContext2D, walker: Walker, seconds: number) {
  const p = walkerPosition(walker, seconds);
  ctx.save(); ctx.translate(p.x,p.y); ctx.scale(p.facing,1);
  drawResidentSprite(ctx, walker.resident, walker.appearance, p.stride);
  ctx.restore();
}

/**
 * The same figure the resident has on the map (appearance is derived from their id, so it matches
 * exactly), standing still and scaled to fit a square of `size` CSS pixels.
 */
export function drawResidentPortrait(ctx: CanvasRenderingContext2D, resident: Resident, size: number) {
  // The sprite spans roughly x -3.7..3.7 and y -16.2..2.6 (feet shadow included).
  const scale = size * 0.86 / 18.8;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, scale);
  ctx.translate(0, 6.8);
  drawResidentSprite(ctx, resident, appearanceFor(resident.id), 0);
  ctx.restore();
}

export function hitTestWalker(hits: Array<{ id: string; x: number; y: number }>, x: number, y: number, radius = 10) {
  let closest: string | null = null;
  let distance = radius;
  for (const hit of hits) {
    const delta = Math.hypot(hit.x-x, hit.y-y);
    if (delta <= distance) { closest = hit.id; distance = delta; }
  }
  return closest;
}
