/** Small isometric crowd gathered at City Hall, rendered in world coordinates. */
export function drawProtest(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, reduced: boolean) {
  ctx.save(); ctx.translate(x, y);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 9; col++) {
    const n = row * 9 + col;
    const px = (col - 4) * 13 + row * 5;
    const py = row * 10;
    const bob = reduced ? 0 : Math.sin(time * 2.4 + n) * 1.2;
    ctx.fillStyle = '#18232c66'; ctx.beginPath(); ctx.ellipse(px,py+4,5,2,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = ['#bd6549','#368c96','#e2b451','#536b91'][n%4]; ctx.fillRect(px-3,py-9+bob,6,10);
    ctx.fillStyle = '#24303c'; ctx.fillRect(px-3,py+1,2,4); ctx.fillRect(px+1,py+1,2,4);
    ctx.fillStyle = ['#edbd91','#ad754f','#724a35'][n%3]; ctx.beginPath(); ctx.arc(px,py-12+bob,3,0,Math.PI*2); ctx.fill();
    if (n%4===0) {
      ctx.fillStyle='#8c6945';ctx.fillRect(px+4,py-26+bob,1,19);
      ctx.fillStyle='#fff0c9';ctx.fillRect(px-7,py-31+bob,25,11);
      ctx.fillStyle='#26323a';ctx.font='bold 4px sans-serif';ctx.textAlign='center';
      ctx.fillText(['HUMANS FIRST','OUR DATA','FAIR AI'][n%3],px+5,py-24+bob);
    }
  }
  ctx.restore();
}
