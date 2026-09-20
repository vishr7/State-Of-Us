import { GW, GH, TW, TH, classifyTile, tileToScreen } from './cityMapData';

type Tile = { x: number; y: number };
export type Car = {
  route: Tile[];
  progress: number; // distance along the route, in tile-segments
  baseSpeed: number; // tile-segments per second at full throttle
  throttle: number; // eased 0..1 speed multiplier, driven by nearby traffic/pedestrians
  variant: number;
  stuckTime: number; // seconds spent nearly stopped, for the anti-gridlock override below
};

/** Cars use every road tile, bridges included — unlike pedestrians, who stay off bridges. */
export function isDrivable(x: number, y: number) {
  if (x < 0 || y < 0 || x >= GW || y >= GH) return false;
  return classifyTile(x, y).ground === 'road';
}

/**
 * Builds `count` cars, each following its own random loop of connected road
 * tiles (bridges included). Mirrors `createWalkers`'s route-then-retrace
 * approach so a car's loop never needs to teleport across a building or river.
 */
export function createCars(count: number): Car[] {
  const roads: Tile[] = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (isDrivable(x, y)) roads.push({ x, y });
  if (!roads.length) return [];

  const cars: Car[] = [];
  for (let index = 0; index < count; index++) {
    let seed = index * 7919 + 17;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

    const route: Tile[] = [roads[Math.floor(random() * roads.length)]];
    for (let step = 0; step < 40; step++) {
      const last = route[route.length - 1], previous = route[route.length - 2];
      const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => ({ x: last.x + dx, y: last.y + dy }))
        .filter(p => isDrivable(p.x, p.y));
      const forward = neighbors.filter(p => !previous || p.x !== previous.x || p.y !== previous.y);
      const choices = forward.length ? forward : neighbors;
      if (!choices.length) break;
      route.push(choices[Math.floor(random() * choices.length)]);
    }
    // Retrace the same road loop so cars never cut across a building or river.
    const loop = route.length > 1 ? [...route, ...route.slice(1, -1).reverse()] : route;
    cars.push({
      route: loop,
      progress: random() * loop.length,
      baseSpeed: 0.45 + random() * 0.35,
      throttle: 1,
      variant: index % 4,
      stuckTime: 0,
    });
  }
  return cars;
}

/** How far a tile-space unit vector (dtx,dty ∈ {-1,0,1}) projects on screen. */
function screenDelta(dtx: number, dty: number) {
  return { x: (dtx - dty) * (TW / 2), y: (dtx + dty) * (TH / 2) };
}

// Half the asphalt band's width (see drawRoad's 0.68-wide fill) so the lane
// center sits inside the road, clear of the sidewalk band along its edges.
const LANE_OFFSET = 0.17;
// Fraction of a tile-segment, right before each waypoint, spent easing from
// the old heading to the new one — rounds the corner instead of pivoting the
// lane offset (and sprite facing) instantly at the tile boundary.
const TURN_EASE = 0.35;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

interface CarFrame { x: number; y: number; alongX: boolean; variant: number; dirX: number; dirY: number }

/** Pure readout of a car's current screen position/heading — does not advance state. */
export function carFrame(car: Car): CarFrame {
  const routeLength = car.route.length;
  const index = Math.floor(car.progress) % routeLength;
  const a = car.route[index], b = car.route[(index + 1) % routeLength], c = car.route[(index + 2) % routeLength];
  const fraction = car.progress % 1;
  const dtx1 = b.x - a.x, dty1 = b.y - a.y;
  const dtx2 = c.x - b.x, dty2 = c.y - b.y;

  // A retraced loop reverses direction at its dead end (dtx2,dty2 = -dtx1,-dty1);
  // blending through that would momentarily cancel the direction vector to
  // zero, so treat a reversal like a straight segment instead of easing it.
  const isReversal = dtx1 === -dtx2 && dty1 === -dty2;

  // Position always walks the plain tile-to-tile line for this segment — it
  // never overshoots into the next segment's geometry, so it lands exactly
  // on `b` at fraction 1 and exactly on `b` again (as the new `a`) at the
  // next segment's fraction 0. Only the heading (used below for the lane
  // offset and sprite facing) eases toward the outgoing direction over the
  // last TURN_EASE of the segment, so the turn itself reads as a smooth
  // swing instead of an instant pivot, with no discontinuity in position.
  const tx = a.x + dtx1 * fraction;
  const ty = a.y + dty1 * fraction;
  let dtx: number, dty: number;
  if (isReversal || (dtx1 === dtx2 && dty1 === dty2) || fraction <= 1 - TURN_EASE) {
    dtx = dtx1; dty = dty1;
  } else {
    const t = smoothstep((fraction - (1 - TURN_EASE)) / TURN_EASE);
    dtx = dtx1 * (1 - t) + dtx2 * t;
    dty = dty1 * (1 - t) + dty2 * t;
  }

  const dirLength = Math.hypot(dtx, dty) || 1;
  const ndtx = dtx / dirLength, ndty = dty / dirLength;
  // Right-hand lane offset: perpendicular to travel direction, rotated so
  // opposite-direction traffic on the same street sits on opposite sides of
  // the centerline (facing east -> offset south, facing north -> offset east, etc).
  const position = tileToScreen(tx - ndty * LANE_OFFSET, ty + ndtx * LANE_OFFSET);
  const dir = screenDelta(ndtx, ndty);
  const dirScale = Math.hypot(dir.x, dir.y) || 1;
  return {
    ...position,
    alongX: Math.abs(dty) <= Math.abs(dtx),
    variant: car.variant,
    dirX: dir.x / dirScale,
    dirY: dir.y / dirScale,
  };
}

// Approximate sprite hitbox radii (screen px) — braking distance is measured
// from body edge to body edge, not center to center, so a full stop leaves a
// visible gap instead of sitting on top of the thing it yielded to.
const CAR_RADIUS = 24;
const PED_RADIUS = 10;
// Extra lookahead beyond the hitbox gap where a car starts easing off the gas.
const CAR_LOOKAHEAD = 90;
// Crossing (perpendicular) traffic only needs to react once it's actually
// near the shared intersection tile — using the same long lookahead as
// same-lane following made cars in dense grids (lots of close-together
// intersections) start yielding to crossers that were nowhere close yet.
const CAR_CROSS_LOOKAHEAD = 45;
const PED_LOOKAHEAD = 50;
const CAR_LATERAL_MAX = 20;
// A car that's been essentially stopped this long ignores the crossing-yield
// rule (but never the pedestrian or same-lane-following ones) so a dense
// intersection cluster can't wedge two cars into waiting on each other
// indefinitely — see the `heading < 0.5` branch below.
const STUCK_OVERRIDE_SECONDS = 2.5;
// A pedestrian's fixed sidewalk offset puts them ~17px off any road's
// centerline (see residentWalkers' 0.39 tile offset); this stays well under
// that so a person walking down the sidewalk never registers as "in the
// lane" — only someone crossing through the roadway itself would.
const PED_LATERAL_MAX = 9;

/** Distance (forward, along self's heading) from self's edge to the obstacle's edge, or null if it's not a braking concern. */
function edgeGapAhead(self: CarFrame, dx: number, dy: number, otherRadius: number, lateralMax: number): number | null {
  const forward = dx * self.dirX + dy * self.dirY;
  if (forward <= 0) return null; // behind or beside — not ahead
  const lateral = Math.abs(dx * self.dirY - dy * self.dirX);
  if (lateral >= lateralMax) return null; // not in the same lane/path
  return forward - CAR_RADIUS - otherRadius;
}

function throttleForGap(gap: number | null, lookahead: number): number {
  if (gap === null) return 1;
  if (gap <= 0) return 0; // hitboxes would already be touching — hard stop
  if (gap >= lookahead) return 1;
  return gap / lookahead; // linear ease so braking reads smoothly, not a snap-stop
}

/**
 * Advances every car by `dt` seconds, braking — down to a dead stop, hitbox
 * edge to hitbox edge — for whatever sits directly ahead in its lane:
 *
 *  - Pedestrians always have the right of way (cars never make them yield),
 *    but a pedestrian walking the sidewalk parallel to the road is far
 *    enough off centerline that `PED_LATERAL_MAX` never flags them; only
 *    someone actually in the roadway does.
 *  - Same-direction traffic (dot(dirSelf, dirOther) > 0) is a following
 *    check: it's inherently one-directional (the trailing car sees the
 *    leader ahead; the leader never sees the trailing car as ahead of it),
 *    so queues never deadlock and never phase through each other.
 *  - Opposite-direction traffic is skipped — the right-hand lane offset
 *    already keeps them physically apart.
 *  - Crossing traffic at an intersection uses a fixed priority (lower array
 *    index goes first) so two perpendicular cars can't both wait forever —
 *    and if a car still ends up stuck near-stationary for a while anyway
 *    (dense clusters of back-to-back intersections can chain several
 *    crossing conflicts together), it stops deferring to crossers and eases
 *    on through, so traffic can't wedge itself into a permanent jam.
 */
export function advanceCars(cars: Car[], dt: number, pedestrianPoints: Array<{ x: number; y: number }>): void {
  if (dt <= 0) return;
  const frames = cars.map(carFrame);
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i], self = frames[i];
    const forceThrough = car.stuckTime >= STUCK_OVERRIDE_SECONDS;
    let targetThrottle = 1;
    for (let j = 0; j < cars.length; j++) {
      if (j === i) continue;
      const other = frames[j];
      const heading = self.dirX * other.dirX + self.dirY * other.dirY;
      if (heading < -0.5) continue; // oncoming traffic in the opposite lane — no conflict
      const crossing = heading < 0.5;
      if (crossing && j > i && !forceThrough) continue; // crossing paths: only the lower-index car has right of way
      const gap = edgeGapAhead(self, other.x - self.x, other.y - self.y, CAR_RADIUS, CAR_LATERAL_MAX);
      targetThrottle = Math.min(targetThrottle, throttleForGap(gap, crossing ? CAR_CROSS_LOOKAHEAD : CAR_LOOKAHEAD));
    }
    for (const point of pedestrianPoints) {
      const gap = edgeGapAhead(self, point.x - self.x, point.y - self.y, PED_RADIUS, PED_LATERAL_MAX);
      targetThrottle = Math.min(targetThrottle, throttleForGap(gap, PED_LOOKAHEAD));
    }
    // Ease throttle rather than snapping, so braking/accelerating reads smoothly.
    car.throttle += (targetThrottle - car.throttle) * Math.min(1, dt * 4);
    car.throttle = Math.max(0, Math.min(1, car.throttle));
    car.stuckTime = car.throttle < 0.15 ? car.stuckTime + dt : 0;
    car.progress = (car.progress + car.baseSpeed * car.throttle * dt) % car.route.length;
  }
}
