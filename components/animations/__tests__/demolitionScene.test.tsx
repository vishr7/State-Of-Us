import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import WreckingBallDemolition from '../WreckingBallDemolition';
import { ballPosition, demolitionFrame, IMPACT_PROGRESS, FALLING_BALL, BUILDING_PIECES, pieceFrame, debrisFrame } from '../demolitionScene';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('demolition initial render', () => {
  it.each([false, true])('keeps identical initial markup with reduced motion=%s', (matches) => {
    const errors = vi.spyOn(console, 'error');
    const server = renderToString(<WreckingBallDemolition />);
    const matchMedia = vi.fn(() => ({ matches }));
    vi.stubGlobal('window', { matchMedia });
    const browserEnvironment = renderToString(<WreckingBallDemolition />);
    expect(browserEnvironment).toBe(server);
    expect(matchMedia).not.toHaveBeenCalled();
    expect(server).toContain('Ready for demolition');
    expect(server).toContain('/sprites/city-atlas.png');
    expect(server).toContain('>Wrecking ball demolition — ready for demolition</title>');
    expect(errors).not.toHaveBeenCalled();
    // In particular the collapsing structure must not SSR in its last keyframe.
    expect(demolitionFrame(0)).toMatchObject({ buildingOpacity: 1, rubble: 0, collapse: 0, dust: 0 });
  });

  it('supports a static intact preview without playback controls', () => {
    const html = renderToString(<WreckingBallDemolition autoPlay={false} showReplayButton={false} width={480} />);
    expect(html).not.toContain('<button');
    expect(html).toContain('width:480px');
    expect(html).toContain('Ready for demolition');
  });
});

describe('deterministic demolition frames', () => {
  it('holds adjoining facade pieces intact, then staggers release and fades only after landing', () => {
    for (const piece of BUILDING_PIECES) {
      expect(pieceFrame(piece.start, piece)).toMatchObject({ x: 0, y: 0, rotate: 0, opacity: 1 });
      expect(pieceFrame(piece.land, piece).y).toBeCloseTo(piece.drop);
      expect(pieceFrame(piece.land, piece).opacity).toBe(1);
      expect(pieceFrame(1, piece).opacity).toBe(0);
      for (const boundary of [piece.start, piece.start + (piece.land - piece.start) * .8, piece.land, piece.land + .065]) {
        const before = pieceFrame(boundary - .000001, piece);
        const after = pieceFrame(boundary + .000001, piece);
        expect(Math.abs(after.y - before.y)).toBeLessThan(.01);
      }
    }
    expect(new Set(BUILDING_PIECES.map((piece) => piece.start)).size).toBe(6);
    expect(pieceFrame(.45, BUILDING_PIECES[0]).y).toBeGreaterThan(0);
    expect(pieceFrame(.45, BUILDING_PIECES[5]).y).toBe(0);
  });

  it('launches debris in waves and settles it before fading', () => {
    expect(debrisFrame(.38, 0).opacity).toBeGreaterThan(0);
    expect(debrisFrame(.38, 3).opacity).toBe(0);
    for (let i = 0; i < 10; i++) {
      const landed = debrisFrame(.37 + i % 4 * .027 + .3, i);
      expect(landed.y).toBeCloseTo(320);
      expect(landed.opacity).toBe(1);
      expect(debrisFrame(1, i).opacity).toBe(0);
    }
  });
  it('hits before collapse, then ends with stable rubble and no particles', () => {
    expect(demolitionFrame(IMPACT_PROGRESS)).toMatchObject({ collapse: 0, buildingOpacity: 1 });
    expect(demolitionFrame(.38).flash).toBeGreaterThan(0);
    expect(demolitionFrame(.38).crack).toBeGreaterThan(0);
    const collapsing = demolitionFrame(.56);
    expect(collapsing.collapse).toBeGreaterThan(0);
    expect(collapsing.collapse).toBeLessThan(1);
    expect(collapsing.dust).toBeGreaterThan(0);
    expect(demolitionFrame(1)).toMatchObject({ rubble: 1, collapse: 1, buildingOpacity: 0, dust: 0, flash: 0, crack: 0, shake: 0 });
    expect(demolitionFrame(1)).toEqual(demolitionFrame(1.1));
  });

  it('falls vertically from offscreen, accelerates, recoils and stays in bounds after entry', () => {
    expect(ballPosition(0).y + FALLING_BALL.radius).toBeLessThan(0);
    expect(ballPosition(.3).y - ballPosition(.25).y).toBeGreaterThan(ballPosition(.2).y - ballPosition(.15).y);
    expect(ballPosition(IMPACT_PROGRESS).y).toBe(FALLING_BALL.impactY);
    expect(ballPosition(.39).y).toBeLessThan(FALLING_BALL.impactY);
    expect(ballPosition(1).y).toBe(FALLING_BALL.restY);
    for (let step = 0; step <= 480; step++) {
      const ball = ballPosition(step / 480);
      expect(ball.x).toBe(FALLING_BALL.x);
      expect(ball.x - FALLING_BALL.radius).toBeGreaterThan(235);
      expect(ball.x + FALLING_BALL.radius).toBeLessThan(665);
      expect(ball.y + FALLING_BALL.radius).toBeLessThan(395);
      if (step / 480 >= .28) expect(ball.y - FALLING_BALL.radius).toBeGreaterThan(0);
    }
  });

  it('has no frame-value jumps at fall, recoil, collapse or fade boundaries', () => {
    for (const time of [.06, .43, .77, .85, .12, .35, .359, .365, .39, .405, .415, .44, .46, .52, .53, .57, .62, .66, .67, .68, .7, .74, .76, .78, .79, .8, .88, .96]) {
      const before = demolitionFrame(time - .00001);
      const after = demolitionFrame(time + .00001);
      expect(Math.abs(after.ball.y - before.ball.y)).toBeLessThan(.04);
      for (const key of ['shake', 'crack', 'dust', 'flash', 'rubble', 'buildingOpacity', 'settle'] as const) {
        expect(Math.abs(after[key] - before[key])).toBeLessThan(.04);
      }
    }
  });
});
