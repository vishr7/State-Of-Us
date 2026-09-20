/** Small shaded sedan projected onto the same 2:1 grid as the streets. */
export function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, alongX: boolean, variant: number) {
  const colors = [
    { paint: '#dca83f', light: '#ffe099', dark: '#976426' },
    { paint: '#b95147', light: '#ef9981', dark: '#743b38' },
    { paint: '#b9ced1', light: '#f1f4e7', dark: '#728e9b' },
    { paint: '#4f819a', light: '#95bfd0', dark: '#304d67' },
  ];
  const color = colors[variant % colors.length];
  type Point = [number, number, number];
  const project = ([a, b, z]: Point): [number, number] => [(a - b) * (alongX ? 1 : -1), (a + b) * 0.5 - z];
  const face = (points: Point[], fill: string) => {
    ctx.beginPath();
    points.forEach((point, i) => { const [px, py] = project(point); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  };
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#17222c55';
  ctx.beginPath(); ctx.ellipse(0, 2, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
  // Raised body, rear panel and visible passenger side.
  face([[-11,-5,3],[11,-5,3],[11,5,3],[-11,5,3]], color.dark);
  face([[-11,5,3],[11,5,3],[11,5,7],[-11,5,7]], color.paint);
  face([[11,-5,3],[11,5,3],[11,5,7],[11,-5,7]], color.dark);
  face([[-11,-5,7],[11,-5,7],[11,5,7],[-11,5,7]], color.light);
  // Tires stay vertical instead of lying flat on the road.
  for (const a of [-7, 7]) {
    const [wx, wy] = project([a,5.3,2.5]);
    ctx.fillStyle = '#18232b'; ctx.beginPath(); ctx.ellipse(wx, wy, 2.2, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a8b3b8'; ctx.beginPath(); ctx.ellipse(wx, wy, 1, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Cabin with sloping windshield, side glazing, and a bright roof.
  face([[-5,-4,7],[-2,-3.5,12],[4,-3.5,12],[7,-4,7]], '#325568');
  face([[-5,4,7],[-2,3.5,12],[4,3.5,12],[7,4,7]], '#263e50');
  face([[4,-3.5,12],[7,-4,7],[7,4,7],[4,3.5,12]], '#7098a9');
  face([[-2,-3.5,12],[4,-3.5,12],[4,3.5,12],[-2,3.5,12]], color.light);
  face([[0,3.6,7],[0,3.6,12],[0.8,3.6,12],[0.8,3.6,7]], color.paint);
  // Headlights, rear lights and chrome bumper.
  for (const b of [-3.5, 2]) {
    face([[11,b,4.5],[11,b+1.5,4.5],[11,b+1.5,6],[11,b,6]], '#fff0bb');
    face([[-11,b,4.5],[-11,b+1.5,4.5],[-11,b+1.5,6],[-11,b,6]], '#cb4a3b');
  }
  face([[11,-4,3.5],[11,4,3.5],[11,4,4],[11,-4,4]], '#cad1cf');
  ctx.restore();
}
