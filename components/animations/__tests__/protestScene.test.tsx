import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import ProtestEventAnimation from '../ProtestEventAnimation';
import { PROTESTORS, PROTEST_SECONDS, protestFrame } from '../protestScene';

afterEach(() => vi.unstubAllGlobals());

describe('protest scene', () => {
  it('keeps server markup deterministic without reading browser preferences', () => {
    const server = renderToString(<ProtestEventAnimation />);
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('window', { matchMedia });
    expect(renderToString(<ProtestEventAnimation />)).toBe(server);
    expect(matchMedia).not.toHaveBeenCalled();
    expect(server).toContain('/sprites/city-atlas.png');
    expect(server).toContain('Ready to gather');
  });

  it('supports an embedded scene without visible controls', () => {
    const html = renderToString(<ProtestEventAnimation width={320} height={240} autoPlay={false} showReplayButton={false} />);
    expect(html).not.toContain('<button');
    expect(html).toContain('width:320px');
    expect(html).toContain('height:240px');
  });

  it('staggers arrivals, raises signs after arrival, and holds the final scene', () => {
    expect(protestFrame(.5, 0).opacity).toBe(1);
    expect(protestFrame(.5, 8).opacity).toBe(0);
    PROTESTORS.forEach((person, index) => {
      expect(protestFrame(0, index).opacity).toBe(0);
      expect(protestFrame(person.delay + .8, index).raise).toBe(0);
      expect(protestFrame(PROTEST_SECONDS, index)).toMatchObject({ x: person.x, y: person.y, opacity: 1, raise: 1, wave: 0 });
      expect(protestFrame(PROTEST_SECONDS + 20, index)).toEqual(protestFrame(PROTEST_SECONDS, index));
    });
  });

  it('keeps citizens and raised sign extents inside the scene throughout playback', () => {
    for (let step = 0; step <= 460; step++) {
      PROTESTORS.forEach((_, index) => {
        const frame = protestFrame(step / 100, index);
        expect(frame.x - 16).toBeGreaterThan(0);
        expect(frame.x + 26).toBeLessThan(360);
        expect(frame.y - 55).toBeGreaterThan(0);
        expect(frame.y + 5).toBeLessThan(280);
        if (step) {
          const before = protestFrame((step - 1) / 100, index);
          expect(Math.abs(frame.x - before.x)).toBeLessThan(1);
          expect(Math.abs(frame.y - before.y)).toBeLessThan(.3);
        }
      });
    }
  });
});
