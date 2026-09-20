import { tileToScreen } from '../map/cityMapData';

// Small, closed routes sit safely inside the Ohio's open water, west of the Point.
export function drawRiverLife(ctx: CanvasRenderingContext2D, seconds: number) {
  for (let i = 0; i < 10; i++) {
    const kayak = i < 3;
    const phase = seconds * (kayak ? .045 : .032) + i * 2.4;
    const tx = kayak ? 3.2 + Math.cos(phase) * 2 : 2.7 + Math.cos(phase) * 1.4;
    const ty = kayak ? 15.35 + i * .65 + Math.sin(phase) * .18 : 15.6 + (i % 3) * .35 + Math.sin(phase) * .25;
    const p = tileToScreen(tx, ty);
    const dx = -Math.sin(phase) * (kayak ? 2 : 1.4);
    const dy = Math.cos(phase) * (kayak ? .18 : .25);
    const heading = Math.atan2((dx + dy) * 24, (dx - dy) * 48);
    ctx.save(); ctx.translate(p.x, p.y);
    // Surface shadow and wake remain flat on the river.
    ctx.fillStyle = '#173e493b';
    ctx.beginPath(); ctx.ellipse(0, 2, kayak ? 12 : 4, kayak ? 4 : 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(heading);
    ctx.strokeStyle = '#d6eff18a'; ctx.lineWidth = .7;
    ctx.beginPath();ctx.moveTo(-5,-3);ctx.quadraticCurveTo(-12,-5,-18,-5);
    ctx.moveTo(-5,3);ctx.quadraticCurveTo(-12,5,-18,5);ctx.stroke();
    if (kayak) {
      ctx.fillStyle = ['#e8a844','#db7159','#68b8bf'][i];
      ctx.beginPath(); ctx.moveTo(15,0);ctx.quadraticCurveTo(0,-8,-14,0);ctx.quadraticCurveTo(0,8,15,0);ctx.fill();
      ctx.strokeStyle = '#f8ddaa';ctx.lineWidth=.8;ctx.stroke();
      ctx.fillStyle = '#243a45';ctx.beginPath();ctx.ellipse(0,0,5,2.8,0,0,Math.PI*2);ctx.fill();
      // Seated paddler, life jacket and alternating paddle stroke.
      ctx.fillStyle = '#efb548';ctx.fillRect(-2,-3,5,5);
      ctx.fillStyle = ['#d8a275','#8a5a3c','#ecc5a1'][i];ctx.beginPath();ctx.arc(1,-3,2.4,0,Math.PI*2);ctx.fill();
      ctx.save();ctx.rotate(Math.sin(seconds*1.8+i)*.45);
      ctx.strokeStyle='#354450';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(0,12);ctx.stroke();
      ctx.fillStyle='#f2e0b2';ctx.fillRect(-1.5,-13,3,5);ctx.fillRect(-1.5,8,3,5);ctx.restore();
    } else {
      ctx.fillStyle = i % 2 ? '#e9e2c8' : '#997f5b';
      ctx.beginPath();ctx.ellipse(0,0,4,2.4,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle = i % 2 ? '#faf4dd' : '#416e55';
      ctx.beginPath();ctx.arc(3,-1.8,2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#e5b350';ctx.beginPath();ctx.moveTo(4.5,-2);ctx.lineTo(7,-1);ctx.lineTo(4.5,0);ctx.fill();
      ctx.fillStyle='#253843';ctx.fillRect(3.5,-2.5,.8,.8);
    }
    ctx.restore();
  }
}
