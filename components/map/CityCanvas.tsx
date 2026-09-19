'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useCityPulseStore } from '@/lib/store';

// ============================================================
// CityCanvas — PixiJS v8 isometric Pittsburgh city map.
// THIS FILE IS DYNAMICALLY IMPORTED WITH ssr:false.
// window/document are safe to reference here.
//
// NOTE: All PixiJS types are referenced via typeof imports
// inside the async init function to avoid SSR type errors.
// ============================================================

// Avoid TypeScript type-annotating PixiJS classes directly —
// they are only available at runtime inside the async init.
// We use ReturnType<> and generics instead.

export default function CityCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appRef = useRef<any>(null);
  const selectNeighborhood = useCityPulseStore(s => s.selectNeighborhood);
  const selectBridge = useCityPulseStore(s => s.selectBridge);
  const neighborhoods = useCityPulseStore(s => s.neighborhoods);

  const initPixi = useCallback(async () => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    // Dynamic import — safe here since ssr:false
    const PIXI = await import('pixi.js');
    const { Application, Graphics, Container, Text } = PIXI;

    const app = new Application();
    await app.init({
      width: el.clientWidth || 800,
      height: el.clientHeight || 500,
      backgroundColor: 0x0D1E30,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    appRef.current = app;
    el.appendChild(app.canvas as HTMLCanvasElement);

    // Resize observer
    const ro = new ResizeObserver(() => {
      app.renderer.resize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);

    // ------ LAYER SETUP ----------------------------------------
    const worldContainer = new Container();
    app.stage.addChild(worldContainer);

    const terrainLayer    = new Container();
    const bridgeLayer     = new Container();
    const buildingLayer   = new Container();
    const neighborhoodLayer = new Container();
    const labelLayer      = new Container();
    const inclineLayer    = new Container();

    worldContainer.addChild(terrainLayer);
    worldContainer.addChild(bridgeLayer);
    worldContainer.addChild(buildingLayer);
    worldContainer.addChild(neighborhoodLayer);
    worldContainer.addChild(inclineLayer);
    worldContainer.addChild(labelLayer);

    // ------ ISOMETRIC UTILITIES --------------------------------
    const TILE_W = 64;
    const TILE_H = 32;
    const MAP_COLS = 24;
    const MAP_ROWS = 20;
    const originX = 400;
    const originY = 80;

    function isoToScreen(col: number, row: number): [number, number] {
      const sx = originX + (col - row) * (TILE_W / 2);
      const sy = originY + (col + row) * (TILE_H / 2);
      return [sx, sy];
    }

    // ------ WATER TILE CHECK ----------------------------------
    function isWaterTile(col: number, row: number): boolean {
      const allegheny = row <= 4 + col * 0.3 && row >= 2 + col * 0.25;
      const mono = row >= 12 + col * 0.1 && row <= 15 + col * 0.05;
      const ohio = col < 8 && Math.abs(row - 10) <= 1.5;
      const confluence = Math.sqrt((col - 8) ** 2 + (row - 9) ** 2) < 2;
      return allegheny || mono || ohio || confluence;
    }

    function isHillTile(col: number, row: number): boolean {
      const mtWash = row >= 15 && col >= 5 && col <= 14;
      const eastHills = col >= 18 && row <= 10;
      return mtWash || eastHills;
    }

    // ------ TERRAIN -------------------------------------------
    function drawTerrain() {
      const g = new Graphics();
      for (let col = 0; col < MAP_COLS; col++) {
        for (let row = 0; row < MAP_ROWS; row++) {
          const [sx, sy] = isoToScreen(col, row);
          const isWater = isWaterTile(col, row);
          const isHill = isHillTile(col, row);
          g.poly([sx, sy, sx + TILE_W / 2, sy + TILE_H / 2, sx, sy + TILE_H, sx - TILE_W / 2, sy + TILE_H / 2]);
          if (isWater) {
            g.fill({ color: 0x1B4E8A, alpha: 0.9 });
          } else if (isHill) {
            g.fill({ color: 0x1A3520, alpha: 0.95 });
            // Hill depth face
            g.poly([sx - TILE_W / 2, sy + TILE_H / 2, sx, sy + TILE_H, sx, sy + TILE_H + 12, sx - TILE_W / 2, sy + TILE_H / 2 + 12]);
            g.fill({ color: 0x142B14 });
          } else {
            g.fill({ color: (col + row) % 2 === 0 ? 0x1A2E1A : 0x1E3520 });
          }
        }
      }
      terrainLayer.addChild(g);
    }

    // ------ THREE RIVERS --------------------------------------
    function drawRivers() {
      const g = new Graphics();

      const drawRiverLine = (pts: [number,number][], width: number, color: number) => {
        if (pts.length < 2) return;
        g.setStrokeStyle({ width, color, alpha: 0.95, cap: 'round', join: 'round' });
        g.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
        g.stroke();
      };

      drawRiverLine([
        isoToScreen(24,0), isoToScreen(22,1), isoToScreen(20,2),
        isoToScreen(17,3), isoToScreen(14,4), isoToScreen(12,5),
        isoToScreen(10,7), isoToScreen(8,9),
      ], 20, 0x1E5FA0);

      drawRiverLine([
        isoToScreen(24,18), isoToScreen(22,17), isoToScreen(20,16),
        isoToScreen(17,15), isoToScreen(14,14), isoToScreen(11,13),
        isoToScreen(9,11), isoToScreen(8,9),
      ], 22, 0x1A5090);

      drawRiverLine([
        isoToScreen(8,9), isoToScreen(6,9), isoToScreen(4,9),
        isoToScreen(2,9), isoToScreen(0,9),
      ], 28, 0x1B4E8A);

      // Confluence fill
      g.circle(isoToScreen(8,9)[0], isoToScreen(8,9)[1], 18);
      g.fill({ color: 0x1B4E8A });

      // Water ripples
      g.setStrokeStyle({ width: 1, color: 0x2E6BB0, alpha: 0.4 });
      for (let i = 0; i < 5; i++) {
        const [sx, sy] = isoToScreen(4 + i * 3, 9);
        g.moveTo(sx - 10, sy); g.lineTo(sx + 10, sy);
      }
      g.stroke();

      terrainLayer.addChild(g);
    }

    // ------ BRIDGES -------------------------------------------
    function drawBridges() {
      // Three Sisters (gold suspension)
      const threeSisters = [
        { col: 12, rowN: 4, rowS: 7, id: 'br-clemente', name: 'R. Clemente Bridge' },
        { col: 13, rowN: 4, rowS: 7, id: 'br-warhol', name: 'A. Warhol Bridge' },
        { col: 14, rowN: 4, rowS: 7, id: 'br-rachel-carson', name: 'R. Carson Bridge' },
      ];

      threeSisters.forEach(({ col, rowN, rowS, id, name }) => {
        const g = new Graphics();
        const [x1, y1] = isoToScreen(col, rowN);
        const [x2, y2] = isoToScreen(col, rowS);
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2 - 24;

        // Bridge deck
        g.setStrokeStyle({ width: 3, color: 0xFFB81C });
        g.moveTo(x1, y1 + 16); g.lineTo(x2, y2 + 16); g.stroke();

        // Cables
        g.setStrokeStyle({ width: 1, color: 0xFFD166 });
        g.moveTo(x1, y1 + 16); g.lineTo(midX, midY); g.lineTo(x2, y2 + 16); g.stroke();

        // Tower
        g.setFillStyle({ color: 0xFFB81C });
        g.rect(midX - 2, midY - 12, 4, 12); g.fill();

        g.eventMode = 'static';
        g.cursor = 'pointer';
        g.on('pointerdown', () => selectBridge(id));
        bridgeLayer.addChild(g);

        // Label
        const label = new Text({ text: name, style: { fontSize: 8, fill: 0xFFD166, fontFamily: 'monospace' } });
        label.x = midX - label.width / 2;
        label.y = midY - 16;
        bridgeLayer.addChild(label);
      });

      // Mon bridges (grey)
      [
        { col: 8, rowN: 9, rowS: 12, id: 'br-fort-pitt' },
        { col: 9, rowN: 9, rowS: 13, id: 'br-smithfield' },
      ].forEach(({ col, rowN, rowS, id }) => {
        const g = new Graphics();
        const [x1, y1] = isoToScreen(col, rowN);
        const [x2, y2] = isoToScreen(col, rowS);
        g.setStrokeStyle({ width: 4, color: 0x7A9EC0 });
        g.moveTo(x1, y1 + 16); g.lineTo(x2, y2 + 16); g.stroke();
        g.eventMode = 'static';
        g.cursor = 'pointer';
        g.on('pointerdown', () => selectBridge(id));
        bridgeLayer.addChild(g);
      });
    }

    // ------ BUILDINGS -----------------------------------------
    type PIXIContainer = InstanceType<typeof Container>;

    function drawSkyscraper(
      layer: PIXIContainer, col: number, row: number,
      w: number, h: number, colorTop: number, colorSide: number, name: string
    ) {
      const g = new Graphics();
      const [sx, sy] = isoToScreen(col, row);
      g.poly([sx, sy-h, sx+w*2, sy-h+w, sx+w*2, sy+w, sx, sy+w*2, sx-w*2, sy+w, sx-w*2, sy-h+w]);
      g.fill({ color: colorTop });
      g.poly([sx-w*2, sy-h+w, sx, sy-h, sx, sy+w*2-h*0, sx-w*2, sy+w]); g.fill({ color: colorSide });
      g.poly([sx+w*2, sy-h+w, sx, sy-h, sx, sy+w*2-h*0, sx+w*2, sy+w]);
      g.fill({ color: Math.max(0, colorSide - 0x202020) });
      // Windows
      g.setFillStyle({ color: 0x93C5FD, alpha: 0.4 });
      for (let wx = 0; wx < 2; wx++)
        for (let wy = 0; wy < Math.floor(h / 8); wy++)
          g.rect(sx - w + wx * w, sy - h + 4 + wy * 8, 3, 4);
      g.fill();
      layer.addChild(g);
      if (name) {
        const t = new Text({ text: name, style: { fontSize: 7, fill: 0x93C5FD, fontFamily: 'monospace' } });
        t.x = sx - t.width / 2; t.y = sy - h - 10;
        layer.addChild(t);
      }
    }

    function drawCathedralOfLearning(layer: PIXIContainer, col: number, row: number) {
      const g = new Graphics();
      const [sx, sy] = isoToScreen(col, row);
      g.poly([sx-5, sy, sx+5, sy-4, sx+5, sy-60, sx, sy-66, sx-5, sy-60]); g.fill({ color: 0x6B7280 });
      g.poly([sx-5, sy-60, sx, sy-66, sx-3, sy-60, sx+3, sy-60, sx, sy-66, sx+5, sy-60]); g.fill({ color: 0x4B5563 });
      g.poly([sx-2, sy-66, sx, sy-80, sx+2, sy-66]); g.fill({ color: 0x9CA3AF });
      layer.addChild(g);
      const label = new Text({ text: 'Cathedral of\nLearning', style: { fontSize: 6, fill: 0xD1D5DB, fontFamily: 'monospace', align: 'center' } });
      label.x = sx - label.width / 2; label.y = sy - 90;
      layer.addChild(label);
    }

    function drawStadium(layer: PIXIContainer, col: number, row: number, name: string) {
      const g = new Graphics();
      const [sx, sy] = isoToScreen(col, row);
      g.ellipse(sx, sy+10, 28, 14); g.fill({ color: 0x1E3A5F });
      g.setStrokeStyle({ width: 2, color: 0xFFB81C }); g.ellipse(sx, sy+10, 28, 14); g.stroke();
      g.ellipse(sx, sy+10, 18, 8); g.fill({ color: 0x166534 });
      layer.addChild(g);
      const label = new Text({ text: name, style: { fontSize: 6, fill: 0xFFD166, fontFamily: 'monospace' } });
      label.x = sx - label.width / 2; label.y = sy - 8;
      layer.addChild(label);
    }

    function drawHospital(layer: PIXIContainer, col: number, row: number) {
      const g = new Graphics();
      const [sx, sy] = isoToScreen(col, row);
      g.rect(sx-18, sy-22, 36, 24); g.fill({ color: 0xF8FAFC });
      g.setFillStyle({ color: 0xEF4444 });
      g.rect(sx-3, sy-20, 6, 14); g.fill();
      g.rect(sx-8, sy-15, 16, 5); g.fill();
      layer.addChild(g);
      const label = new Text({ text: 'HOSPITAL', style: { fontSize: 7, fill: 0xEF4444, fontWeight: 'bold', fontFamily: 'monospace' } });
      label.x = sx - label.width / 2; label.y = sy - 30;
      layer.addChild(label);
    }

    function drawFountain(layer: PIXIContainer, col: number, row: number) {
      const g = new Graphics();
      const [sx, sy] = isoToScreen(col, row);
      g.circle(sx, sy, 16); g.fill({ color: 0x166534, alpha: 0.7 });
      g.circle(sx, sy, 6); g.fill({ color: 0x1B4E8A });
      g.setStrokeStyle({ width: 1, color: 0x93C5FD, alpha: 0.7 });
      for (let a = 0; a < 6; a++) {
        const angle = (a / 6) * Math.PI * 2;
        g.moveTo(sx, sy); g.lineTo(sx + Math.cos(angle) * 8, sy + Math.sin(angle) * 4);
      }
      g.stroke();
      layer.addChild(g);
    }

    function drawWarehouse(layer: PIXIContainer, col: number, row: number) {
      const g = new Graphics();
      const [sx, sy] = isoToScreen(col, row);
      g.poly([sx, sy-8, sx+20, sy-4, sx+20, sy+12, sx, sy+16, sx-20, sy+12, sx-20, sy-4]); g.fill({ color: 0x78350F });
      layer.addChild(g);
      const label = new Text({ text: 'Strip District', style: { fontSize: 6, fill: 0xFDE68A, fontFamily: 'monospace' } });
      label.x = sx - label.width / 2; label.y = sy - 18;
      layer.addChild(label);
    }

    function drawChurch(layer: PIXIContainer, col: number, row: number) {
      const g = new Graphics();
      const [sx, sy] = isoToScreen(col, row);
      g.rect(sx-6, sy-10, 12, 12); g.fill({ color: 0x374151 });
      g.poly([sx-3, sy-10, sx, sy-22, sx+3, sy-10]); g.fill({ color: 0x4B5563 });
      g.setFillStyle({ color: 0xD1D5DB });
      g.rect(sx-0.5, sy-21, 1, 5); g.fill();
      g.rect(sx-2, sy-19, 5, 1); g.fill();
      layer.addChild(g);
    }

    function drawHouseSprite(layer: PIXIContainer, col: number, row: number, color: number) {
      const g = new Graphics();
      const [sx, sy] = isoToScreen(col, row);
      g.poly([sx, sy-6, sx+8, sy-3, sx+8, sy+5, sx, sy+8, sx-8, sy+5, sx-8, sy-3]); g.fill({ color });
      g.poly([sx, sy-6, sx+8, sy-3, sx, sy-10, sx-8, sy-3]); g.fill({ color: Math.max(0, color - 0x101010) });
      g.setFillStyle({ color: 0xFEF3C7, alpha: 0.6 }); g.rect(sx-2, sy-3, 3, 3); g.fill();
      layer.addChild(g);
    }

    function drawBuildings() {
      drawSkyscraper(buildingLayer, 9, 8, 8, 40, 0x2563EB, 0x1D4ED8, 'PPG Place');
      drawSkyscraper(buildingLayer, 9, 7, 6, 30, 0x1E40AF, 0x1E3A8A, 'U.S. Steel');
      drawSkyscraper(buildingLayer, 10, 8, 5, 25, 0x3B82F6, 0x2563EB, '');
      drawSkyscraper(buildingLayer, 10, 9, 4, 20, 0x60A5FA, 0x3B82F6, '');
      drawSkyscraper(buildingLayer, 8, 9, 4, 18, 0x7C3AED, 0x6D28D9, '');
      drawCathedralOfLearning(buildingLayer, 16, 6);
      drawStadium(buildingLayer, 11, 2, 'PNC Park');
      drawStadium(buildingLayer, 13, 2, 'Acrisure Stadium');
      drawHospital(buildingLayer, 17, 7);
      drawFountain(buildingLayer, 7, 10);
      drawWarehouse(buildingLayer, 13, 6);
      drawChurch(buildingLayer, 12, 10);
      drawChurch(buildingLayer, 15, 9);
      drawChurch(buildingLayer, 10, 12);

      // Houses
      const houses: Array<{col:number;row:number;color:number}> = [
        {col:20,row:3,color:0xD97706},{col:21,row:4,color:0xB45309},{col:22,row:3,color:0xD97706},
        {col:15,row:5,color:0x2563EB},{col:16,row:4,color:0x1D4ED8},{col:17,row:5,color:0x3B82F6},
        {col:22,row:7,color:0xDC2626},{col:23,row:6,color:0xB91C1C},
        {col:11,row:10,color:0xDC2626},{col:12,row:11,color:0xB91C1C},
        {col:10,row:14,color:0x2563EB},{col:11,row:15,color:0x1D4ED8},
        {col:8,row:16,color:0x059669},{col:9,row:17,color:0x047857},
      ];
      houses.forEach(({col, row, color}) => drawHouseSprite(buildingLayer, col, row, color));
    }

    // ------ INCLINES (animated) --------------------------------
    function drawInclines() {
      [[8.5,13,6.5,16.5],[9.5,13,7.5,16.5]].forEach(([tc, tr, bc, br]) => {
        const g = new Graphics();
        const [tx, ty] = isoToScreen(tc, tr);
        const [bx, by] = isoToScreen(bc, br);
        g.setStrokeStyle({ width: 2, color: 0x4B5563 });
        g.moveTo(tx-3,ty); g.lineTo(bx-3,by);
        g.moveTo(tx+3,ty); g.lineTo(bx+3,by);
        g.stroke();
        inclineLayer.addChild(g);

        // Animated car
        const car = new Graphics();
        car.poly([-5,-4,5,-4,5,4,-5,4]); car.fill({ color: 0xFFB81C });
        inclineLayer.addChild(car);
        let progress = Math.random();
        let dir = 1;
        app.ticker.add(() => {
          progress += 0.003 * dir;
          if (progress >= 1) { progress = 1; dir = -1; }
          if (progress <= 0) { progress = 0; dir = 1; }
          car.x = tx + (bx - tx) * progress;
          car.y = ty + (by - ty) * progress;
        });
      });
    }

    // ------ NEIGHBORHOOD ZONES --------------------------------
    function drawNeighborhoodZones() {
      const canvasW = el.clientWidth || 800;
      const canvasH = el.clientHeight || 500;

      neighborhoods.forEach(n => {
        const cx = n.mapX * canvasW;
        const cy = n.mapY * canvasH;
        const borderColor = n.incomeGroup === 'higher' ? 0xFFB81C
          : n.incomeGroup === 'middle' ? 0x3B82F6 : 0xEF4444;

        // Zone overlay circle
        const g = new Graphics();
        g.circle(cx, cy, 32); g.fill({ color: borderColor, alpha: 0.08 });
        g.setStrokeStyle({ width: 1.5, color: borderColor, alpha: 0.4 }); g.circle(cx, cy, 32); g.stroke();
        g.eventMode = 'static'; g.cursor = 'pointer';
        g.on('pointerdown', () => selectNeighborhood(n.id));
        neighborhoodLayer.addChild(g);

        // Floating label pill
        const labelGroup = new Container();
        const pillW = 115, pillH = 32;
        const bg = new Graphics();
        bg.roundRect(-pillW/2, -pillH/2, pillW, pillH, 8);
        bg.fill({ color: 0x0A1628, alpha: 0.92 });
        bg.setStrokeStyle({ width: 1.5, color: borderColor });
        bg.roundRect(-pillW/2, -pillH/2, pillW, pillH, 8); bg.stroke();
        labelGroup.addChild(bg);

        const icon = new Text({ text: n.incomeGroup === 'higher' ? '👑' : n.incomeGroup === 'middle' ? '🏠' : '🏘️', style: { fontSize: 10 } });
        icon.x = -pillW/2 + 6; icon.y = -7; labelGroup.addChild(icon);

        const nameText = new Text({ text: n.name.toUpperCase(), style: { fontSize: 7, fill: borderColor, fontWeight: 'bold', fontFamily: 'monospace' } });
        nameText.x = -pillW/2 + 22; nameText.y = -12; labelGroup.addChild(nameText);

        const sub = new Text({ text: n.incomeGroup.charAt(0).toUpperCase() + n.incomeGroup.slice(1) + ' Income', style: { fontSize: 6, fill: 0x94A3B8, fontFamily: 'monospace' } });
        sub.x = -pillW/2 + 22; sub.y = 1; labelGroup.addChild(sub);

        labelGroup.eventMode = 'static'; labelGroup.cursor = 'pointer';
        labelGroup.on('pointerdown', () => selectNeighborhood(n.id));
        labelGroup.x = cx; labelGroup.y = cy - 44;
        labelLayer.addChild(labelGroup);
      });
    }

    // ------ PAN / ZOOM ----------------------------------------
    function setupPanZoom() {
      let isDragging = false;
      let lastX = 0; let lastY = 0;
      const canvas = app.canvas as HTMLCanvasElement;
      canvas.addEventListener('mousedown', (e: MouseEvent) => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
      canvas.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) return;
        worldContainer.x += e.clientX - lastX;
        worldContainer.y += e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
      });
      canvas.addEventListener('mouseup', () => { isDragging = false; });
      canvas.addEventListener('mouseleave', () => { isDragging = false; });
      canvas.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault();
        const zf = e.deltaY < 0 ? 1.1 : 0.9;
        const old = worldContainer.scale.x;
        const nw = Math.min(3, Math.max(0.3, old * zf));
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        worldContainer.x = mx - (mx - worldContainer.x) * (nw / old);
        worldContainer.y = my - (my - worldContainer.y) * (nw / old);
        worldContainer.scale.set(nw);
      }, { passive: false });
    }

    // ------ RENDER --------------------------------------------
    drawTerrain();
    drawRivers();
    drawBridges();
    drawBuildings();
    drawInclines();
    drawNeighborhoodZones();
    setupPanZoom();

    worldContainer.x = (el.clientWidth || 800) * 0.05;
    worldContainer.y = (el.clientHeight || 500) * 0.08;

    return () => {
      ro.disconnect();
      app.destroy(true, { children: true });
      appRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initPixi().then(fn => { cleanup = fn; });
    return () => { if (cleanup) cleanup(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ cursor: 'grab' }}
    />
  );
}
