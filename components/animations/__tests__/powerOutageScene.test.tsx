import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import PowerOutageAnimation from '../PowerOutageAnimation';
import { OUTAGE_SECONDS, OUTAGE_WINDOWS, powerOutageFrame } from '../powerOutageScene';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('power outage initial markup', () => {
  it.each([false, true])('does not read browser preferences during render (reduced=%s)', matches => {
    const errors = vi.spyOn(console, 'error');
    const server = renderToString(<PowerOutageAnimation />);
    const matchMedia = vi.fn(() => ({ matches }));
    vi.stubGlobal('window', { matchMedia });
    expect(renderToString(<PowerOutageAnimation />)).toBe(server);
    expect(matchMedia).not.toHaveBeenCalled();
    expect(server).toContain('/sprites/city-atlas.png');
    expect(server).toContain('Power available');
    expect(errors).not.toHaveBeenCalled();
  });

  it('supports contained explicit dimensions and optional controls/backup lights', () => {
    const html = renderToString(<PowerOutageAnimation width={320} height={180} autoPlay={false} showReplayButton={false} showEmergencyLights={false} />);
    expect(html).toContain('width:320px');
    expect(html).toContain('height:180px');
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('amber backup light');
  });
});

describe('power outage timeline', () => {
  it('begins fully powered, dims gently twice, and staggers circuit loss', () => {
    expect(powerOutageFrame(0).windows.every(value => value === 1)).toBe(true);
    expect(powerOutageFrame(0).lamps).toEqual([1, 1]);
    expect(powerOutageFrame(.88).windows[0]).toBeLessThan(.7);
    expect(powerOutageFrame(1.2).windows[0]).toBe(1);
    expect(powerOutageFrame(1.53).windows[0]).toBeLessThan(.6);
    const partial = powerOutageFrame(2.4);
    expect(partial.windows.some(value => value === 0)).toBe(true);
    expect(partial.windows.some(value => value > .9)).toBe(true);
    expect(partial.lamps[0]).toBeLessThan(partial.lamps[1]);
    expect(powerOutageFrame(2.96).spark).toBe(1);
  });

  it('ends with all mains lights off and holds a stable outage', () => {
    const end = powerOutageFrame(OUTAGE_SECONDS);
    expect(end.windows.every(value => value === 0)).toBe(true);
    expect(end.lamps).toEqual([0, 0]);
    expect(end).toMatchObject({ spark: 0, backup: 1 });
    expect(end.shade).toBeCloseTo(.59);
    expect(powerOutageFrame(100)).toEqual(end);
    expect(powerOutageFrame(-10)).toEqual(powerOutageFrame(0));
  });

  it('keeps frame values bounded and transitions continuous', () => {
    const values = (seconds: number) => {
      const f = powerOutageFrame(seconds);
      return [f.shade, f.backup, f.spark, ...f.windows, ...f.lamps];
    };
    for (let step = 0; step <= 450; step++) {
      const t = step / 100;
      const before = values(t - .00001);
      values(t).forEach((value, i) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
        expect(Math.abs(value - before[i])).toBeLessThan(.001);
      });
    }
    OUTAGE_WINDOWS.forEach(window => {
      expect(40 + (window.x + 7) * .8125).toBeLessThan(360);
      expect(10 + (window.y + 17) * .8125).toBeLessThan(280);
    });
  });
});
