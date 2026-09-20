/** Isometric city bus: cream roof, transit-blue body, glazing and route display. */
export function drawBus(ctx: CanvasRenderingContext2D, x: number, y: number, alongX: boolean) {
  type Point = [number, number, number];
  const project = ([a,b,z]: Point) => [(a-b)*(alongX ? 1 : -1), (a+b)*.5-z];
  const face = (points: Point[], color: string) => {
    ctx.beginPath(); points.forEach((p,i) => { const [px,py]=project(p); if(i) ctx.lineTo(px,py); else ctx.moveTo(px,py); });
    ctx.closePath();ctx.fillStyle=color;ctx.fill();
  };
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle='#14273855';ctx.beginPath();ctx.ellipse(0,3,24,9,0,0,Math.PI*2);ctx.fill();
  face([[-19,6,3],[19,6,3],[19,6,17],[-19,6,17]],'#287eac');
  face([[19,-6,3],[19,6,3],[19,6,17],[19,-6,17]],'#195273');
  face([[-19,-6,17],[19,-6,17],[19,6,17],[-19,6,17]],'#f6edcf');
  face([[-18,6.1,5],[18,6.1,5],[18,6.1,7],[-18,6.1,7]],'#f1c95d');
  for(let a=-16;a<12;a+=7) face([[a,6.1,10],[a+5,6.1,10],[a+5,6.1,15],[a,6.1,15]],'#b9e2ea');
  face([[19.1,-5,9],[19.1,5,9],[19.1,5,14],[19.1,-5,14]],'#8fc3d3');
  face([[19.2,-4,15],[19.2,4,15],[19.2,4,16.5],[19.2,-4,16.5]],'#ffd66f');
  for(const a of [-12,12]) { const [px,py]=project([a,6.5,3]);ctx.fillStyle='#18232b';ctx.beginPath();ctx.ellipse(px,py,2.7,3.6,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c1cbd0';ctx.beginPath();ctx.arc(px,py,1.2,0,Math.PI*2);ctx.fill(); }
  ctx.restore();
}
