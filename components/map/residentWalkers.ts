import type { Resident } from '@/lib/types';
import { GW, GH, classifyTile, tileToScreen } from './cityMapData';

type Tile = { x: number; y: number };
export type Walker = { resident: Resident; route: Tile[]; phase: number; speed: number };
const centers: Record<string, Tile> = { shadyside: { x: 6, y: 7 }, homewood: { x: 24, y: 17 }, lawrenceville: { x: 19, y: 7 }, golden_triangle: { x: 17, y: 14 } };
export function isWalkable(x: number, y: number) {
  if (x < 0 || y < 0 || x >= GW || y >= GH) return false;
  const tile = classifyTile(x, y);
  return tile.ground === 'road' && !tile.bridge;
}
export function createWalkers(residents: Resident[]): Walker[] {
  const streets: Tile[] = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (isWalkable(x, y)) streets.push({ x, y });
  return residents.slice(0, 100).map((resident, index) => {
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
    return { resident, route: loop, phase: random() * loop.length, speed: 0.15 + random()*0.12 };
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
export function drawWalker(ctx: CanvasRenderingContext2D, walker: Walker, seconds: number) {
  const p = walkerPosition(walker, seconds);
  ctx.save(); ctx.translate(p.x,p.y); ctx.scale(p.facing,1);
  ctx.fillStyle = '#10232e55'; ctx.beginPath(); ctx.ellipse(0,1,4,1.6,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#29394d'; ctx.lineWidth = 2;
  ctx.beginPath();ctx.moveTo(-1,-4);ctx.lineTo(-1+p.stride,0);ctx.moveTo(1,-4);ctx.lineTo(1-p.stride,0);ctx.stroke();
  ctx.fillStyle = walker.resident.portraitColor;ctx.fillRect(-2.5,-9,5,6);
  // Cosmetic variation is deterministic and independent of persona demographics.
  ctx.fillStyle = ['#e3ba92','#b98360','#81573f'][walker.resident.id.charCodeAt(10)%3];ctx.fillRect(-2,-13,4,4);
  ctx.fillStyle = '#3d3533';ctx.fillRect(-2,-14,4,2);
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
