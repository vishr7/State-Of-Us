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
      const text = ['HUMANS FIRST','OUR DATA','FAIR AI'][n%3];
      const boardX = px-7, boardY = py-31+bob, boardW = 25, boardH = 11;
      ctx.fillStyle='#8c6945';ctx.fillRect(px+4,py-26+bob,1,19);
      ctx.fillStyle='#fff0c9';ctx.fillRect(boardX,boardY,boardW,boardH);
      ctx.save();
      ctx.beginPath(); ctx.rect(boardX+1,boardY+1,boardW-2,boardH-2); ctx.clip();
      ctx.fillStyle='#26323a';ctx.textAlign='center';ctx.textBaseline='middle';
      // Shrink to fit instead of a fixed size, so longer slogans never spill past the board.
      let size = 3.4;
      ctx.font = `bold ${size}px sans-serif`;
      const maxWidth = boardW - 3;
      while (size > 1.6 && ctx.measureText(text).width > maxWidth) { size -= 0.2; ctx.font = `bold ${size}px sans-serif`; }
      ctx.fillText(text, px+5, boardY+boardH/2+0.5);
      ctx.restore();
    }
  }
  ctx.restore();
}
