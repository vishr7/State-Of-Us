import { demolitionFrame, IMPACT_PROGRESS } from './demolitionScene';

// Preserve the gameplay queue's impact and completion schedule.
export const DEMOLITION_IMPACT_MS = 1100;
export const DEMOLITION_DURATION_MS = 2600;
export function mapDemolitionProgress(elapsed: number) {
  const t = Math.max(0, Math.min(DEMOLITION_DURATION_MS, elapsed));
  return t <= DEMOLITION_IMPACT_MS ? t / DEMOLITION_IMPACT_MS * IMPACT_PROGRESS
    : IMPACT_PROGRESS + (t - DEMOLITION_IMPACT_MS) / (DEMOLITION_DURATION_MS - DEMOLITION_IMPACT_MS) * (1 - IMPACT_PROGRESS);
}
export function drawRubble(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  for (let i = 0; i < 9; i++) {
    const px = (i % 3 - 1) * 16 + (Math.floor(i / 3) % 2) * 5, py = Math.floor(i / 3) * 6 - 5;
    ctx.fillStyle = i % 3 ? '#997458' : '#65717a';
    ctx.beginPath(); ctx.moveTo(px - 9, py); ctx.lineTo(px, py - 7); ctx.lineTo(px + 10, py - 2); ctx.lineTo(px + 4, py + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = i % 3 ? '#bc9470' : '#929b9e'; ctx.fillRect(px - 3, py - 4, 7, 3);
  }
  ctx.restore();
}
/** All effects use the same sprite-sized world coordinates as the actual map lot. */
export function drawDemolition(ctx: CanvasRenderingContext2D, x: number, y: number, elapsed: number, reducedMotion = false,
  sprite?: { atlas: HTMLImageElement; index: number; size: number; ground: number }) {
  const progress = reducedMotion && elapsed >= DEMOLITION_IMPACT_MS ? 1 : mapDemolitionProgress(elapsed);
  const frame = demolitionFrame(progress), size = sprite?.size ?? 100;
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  ctx.beginPath(); ctx.rect(-72, -155, 144, 190); ctx.clip();
  ctx.imageSmoothingEnabled = false;
  if (sprite && (!reducedMotion || elapsed < DEMOLITION_IMPACT_MS)) {
    // Reuse precisely the cell and anchor that were removed from the baked map.
    const ground = sprite.ground / size * 100;
    for (let i = 0; i < 6; i++) {
      const part = frame.parts[i], col = i % 2, row = Math.floor(i / 2);
      const left = -50 + col * 50, top = -100 + ground + row * 100 / 3;
      ctx.save(); ctx.globalAlpha = part.opacity;
      ctx.translate(frame.shake * .2 + part.x * .3, part.y / 270 * 100);
      ctx.translate(left + 25, top + 100 / 3); ctx.rotate(part.rotate * Math.PI / 180); ctx.translate(-left - 25, -top - 100 / 3);
      ctx.beginPath(); ctx.rect(left, top, 50, 100 / 3); ctx.clip();
      const sw = sprite.atlas.naturalWidth / 4, sh = sprite.atlas.naturalHeight / 4;
      ctx.drawImage(sprite.atlas, sprite.index % 4 * sw, Math.floor(sprite.index / 4) * sh, sw, sh, -50, -100 + ground, 100, 100);
      ctx.restore();
    }
  }
  if (!reducedMotion && frame.crack > 0) {
    ctx.save(); ctx.globalAlpha = frame.crack; ctx.strokeStyle = '#483f3b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -65); ctx.lineTo(-4, -53); ctx.lineTo(1, -44);
    ctx.lineTo(-6, -32); ctx.lineTo(-2, -20); ctx.stroke(); ctx.restore();
  }
  ctx.save(); ctx.globalAlpha = frame.rubble; drawRubble(ctx, 0, 0, 100); ctx.restore();
  if (!reducedMotion && progress < 1) {
    const by = (frame.ball.y - 319) / 270 * 100;
    ctx.save(); ctx.globalAlpha = Math.min(1, Math.max(0, (progress - .06) / .05)) * (1 - Math.max(0, (progress - .85) / .15)); ctx.translate(0, by);
    ctx.fillStyle = '#34414c'; ctx.strokeStyle = '#202c35'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(6, -10); ctx.lineTo(10, -6); ctx.lineTo(10, 6); ctx.lineTo(6, 10); ctx.lineTo(-6, 10); ctx.lineTo(-10, 6); ctx.lineTo(-10, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#849398'; ctx.fillRect(-6, -7, 5, 3); ctx.restore();
  }
  for (const [i, part] of frame.debris.slice(1, 7).entries()) {
    ctx.save(); ctx.globalAlpha = part.opacity; ctx.translate((part.x - 478) * .35, (part.y - 319) * .35); ctx.rotate(part.rotate * Math.PI / 180);
    ctx.fillStyle = i % 2 ? '#b48463' : '#7c8693'; ctx.fillRect(-2, -1, 4, 3); ctx.restore();
  }
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.globalAlpha = frame.dust * .32;
    ctx.translate((i - 1.5) * (16 + frame.scatter * 6), -5 - frame.scatter * 15 - i % 2 * 4);
    ctx.scale(.5 + frame.scatter * .5, .5 + frame.scatter * .5);
    ctx.fillStyle = i % 2 ? '#c5b394' : '#d8c8a8';
    ctx.beginPath(); ctx.moveTo(-15, 8); ctx.lineTo(-15, -4); ctx.lineTo(-8, -4); ctx.lineTo(-8, -12); ctx.lineTo(8, -12); ctx.lineTo(8, -6); ctx.lineTo(16, -6); ctx.lineTo(16, 8); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}
