import { expect, it, vi } from 'vitest';
import { drawDemolition, mapDemolitionProgress, DEMOLITION_IMPACT_MS, DEMOLITION_DURATION_MS } from '../demolition';
import { IMPACT_PROGRESS } from '../demolitionScene';

it('preserves gameplay impact/completion timing and clamps the visual timeline', () => {
  expect(mapDemolitionProgress(-1)).toBe(0);
  expect(mapDemolitionProgress(DEMOLITION_IMPACT_MS)).toBe(IMPACT_PROGRESS);
  expect(mapDemolitionProgress(DEMOLITION_DURATION_MS)).toBe(1);
  expect(mapDemolitionProgress(9999)).toBe(1);
});

function canvas() {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  const ctx = new Proxy({}, { get: (_, key: string) => calls[key] ??= vi.fn(), set: () => true });
  return { ctx: ctx as CanvasRenderingContext2D, calls };
}
it('collapses the real atlas cell in six pieces at the exact map sprite scale', () => {
  const { ctx, calls } = canvas();
  const atlas = { naturalWidth: 1280, naturalHeight: 1280 } as HTMLImageElement;
  drawDemolition(ctx, 20, 40, 1300, false, { atlas, index: 6, size: 104, ground: 26 });
  expect(calls.translate).toHaveBeenCalledWith(20, 40);
  expect(calls.scale).toHaveBeenCalledWith(1.04, 1.04);
  expect(calls.rect).toHaveBeenCalledWith(-72, -155, 144, 190);
  expect(calls.drawImage).toHaveBeenCalledTimes(6);
  expect(calls.drawImage.mock.calls.every(args => args[0] === atlas && args[1] === 640 && args[2] === 320)).toBe(true);
  expect(calls.save.mock.calls.length).toBe(calls.restore.mock.calls.length);
});
it('reduced motion omits falling ball and collapsing sprite sections', () => {
  const { ctx, calls } = canvas();
  drawDemolition(ctx, 0, 0, DEMOLITION_IMPACT_MS, true);
  expect(calls.drawImage).toBeUndefined();
  expect(calls.save.mock.calls.length).toBe(calls.restore.mock.calls.length);
});

it.each([-1600, 0, 1099, 1100, 1101])('retains the original sprite throughout the renderer handoff at %sms', elapsed => {
  const { ctx, calls } = canvas();
  const atlas = { naturalWidth: 1280, naturalHeight: 1280 } as HTMLImageElement;
  drawDemolition(ctx, 0, 0, elapsed, false, { atlas, index: 4, size: 104, ground: 26 });
  expect(calls.drawImage).toHaveBeenCalledTimes(6);
  expect(calls.drawImage.mock.calls.every(args => args[0] === atlas)).toBe(true);
});
