export const DEMOLITION_SECONDS = 4.8;
export const IMPACT_PROGRESS = .35;
const ramp = (value: number, start: number, end: number) => Math.max(0, Math.min(1, (value - start) / (end - start)));
const smooth = (value: number, start: number, end: number) => { const t = ramp(value, start, end); return t * t * (3 - 2 * t); };
export const FALLING_BALL = { x: 478, startY: -40, impactY: 122, restY: 295, radius: 30 } as const;
export function ballPosition(progress: number) {
  const fall = ramp(progress, .06, IMPACT_PROGRESS);
  let y = FALLING_BALL.startY + (FALLING_BALL.impactY - FALLING_BALL.startY) * fall * fall;
  if (progress >= IMPACT_PROGRESS) {
    const recoil = ramp(progress, IMPACT_PROGRESS, .43);
    y = FALLING_BALL.impactY - Math.sin(recoil * Math.PI) ** 2 * 10
      + smooth(progress, .43, .77) * (FALLING_BALL.restY - FALLING_BALL.impactY)
      - Math.sin(ramp(progress, .77, .85) * Math.PI) ** 2 * 3;
  }
  return { x: FALLING_BALL.x, y };
}

/** Six adjoining sprite regions retain the intact facade until each detaches. */
export const BUILDING_PIECES = Array.from({ length: 6 }, (_, i) => {
  const row = Math.floor(i / 2), side = i % 2;
  return { x: 350 + side * 135, y: 100 + row * 73, width: 135, height: 73,
    start: .415 + row * .031 + side * .013, land: .69 + row * .03 + side * .013,
    drop: 190 - row * 73, drift: (side ? 1 : -1) * (18 - row * 3), tilt: (side ? 1 : -1) * (12 - row * 2) };
});

export function pieceFrame(progress: number, piece: typeof BUILDING_PIECES[number]) {
  const t = ramp(progress, piece.start, piece.land);
  // Accelerate under gravity, then dissipate velocity over the final part of the fall.
  const travel = t < .8 ? t * t : .64 + .32 * ((t - .8) / .2) + .44 * ((t - .8) / .2) ** 2 - .4 * ((t - .8) / .2) ** 3;
  const bounce = Math.sin(ramp(progress, piece.land, piece.land + .065) * Math.PI) ** 2;
  return { x: smooth(progress, piece.start, piece.land + .04) * piece.drift || 0,
    y: travel * piece.drop - bounce * 3,
    rotate: smooth(progress, piece.start, piece.land + .065) * piece.tilt || 0,
    opacity: 1 - smooth(progress, piece.land + .025, piece.land + .1) };
}

export function debrisFrame(progress: number, index: number) {
  const start = .37 + index % 4 * .027;
  const t = ramp(progress, start, start + .3);
  const endX = (index - 4.5) * 18;
  return { x: 478 + endX * (1 - (1 - t) ** 2),
    y: 164 - (30 + index % 3 * 12) * 4 * t * (1 - t) + 156 * t * t,
    rotate: (index % 2 ? 1 : -1) * 105 * smooth(progress, start, start + .34),
    opacity: smooth(progress, start, start + .018) * (1 - smooth(progress, start + .32, start + .43)) };
}

/** Pure frame math: SSR and the first browser render both use progress=0. */
export function demolitionFrame(progress: number) {
  const collapse = smooth(progress, .44, .76);
  const impactAge = Math.max(0, progress - IMPACT_PROGRESS);
  return {
    ball: ballPosition(progress), collapse,
    shake: progress >= .68 ? 0 : Math.sin(impactAge * 220) * 8 * Math.exp(-impactAge * 22) * (1 - smooth(progress, .55, .68)),
    buildingOpacity: 1 - smooth(progress, .66, .8),
    crack: smooth(progress, .35, .405) * (1 - smooth(progress, .57, .67)),
    rubble: smooth(progress, .52, .78),
    settle: Math.sin(ramp(progress, .7, .88) * Math.PI) * 4,
    flash: smooth(progress, .35, .359) * (1 - smooth(progress, .365, .415)),
    scatter: ramp(progress, .35, .85),
    dust: smooth(progress, .39, .53) * (1 - smooth(progress, .7, .96)),
    compression: Math.sin(ramp(progress, .35, .435) * Math.PI) ** 2 * .022,
    parts: BUILDING_PIECES.map((piece) => pieceFrame(progress, piece)),
    debris: Array.from({ length: 10 }, (_, index) => debrisFrame(progress, index)),
  };
}
