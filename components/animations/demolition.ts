/** World-space canvas segment: falling steel ball, impact ring, rubble and dust. */
export const DEMOLITION_IMPACT_MS = 1100;
export const DEMOLITION_DURATION_MS = 2600;

export function drawDemolition(ctx: CanvasRenderingContext2D, x: number, y: number, elapsed: number, reducedMotion = false) {
  const impact = elapsed >= DEMOLITION_IMPACT_MS;
  ctx.save();
  ctx.translate(x, y);
  if (!reducedMotion) {
    const fall = Math.min(1, elapsed / DEMOLITION_IMPACT_MS);
    const lift = impact ? Math.max(0, (elapsed - DEMOLITION_IMPACT_MS - 200) / 1000) * 230 : 0;
    const ballY = -520 * (1 - fall * fall) - 26 - lift;
    ctx.strokeStyle = '#48535d'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(0, ballY - 600); ctx.lineTo(0, ballY); ctx.stroke();
    ctx.fillStyle = '#27323c'; ctx.strokeStyle = '#9aa6b0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, ballY, 29, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#62717c'; ctx.beginPath(); ctx.arc(-9, ballY - 10, 9, 0, Math.PI * 2); ctx.fill();
  }
  if (impact) {
    const progress = Math.min(1, (elapsed - DEMOLITION_IMPACT_MS) / 1500);
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = '#efd5a2'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 25 + progress * 110, 10 + progress * 45, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const angle = i * 2.4;
      ctx.fillStyle = i % 2 ? '#c5b394' : '#a5967f';
      ctx.beginPath(); ctx.arc(Math.cos(angle) * progress * 85, Math.sin(angle) * progress * 28 - progress * 30, 12 + progress * 19, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
