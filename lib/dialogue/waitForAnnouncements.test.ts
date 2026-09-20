import { afterEach, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { waitForAnnouncements } from './waitForAnnouncements';
afterEach(() => vi.useRealTimers());
it('continues when narration finishes, even if other announcements remain', async () => {
  const store = createStore(() => ({ announcements: [{ id: 1 }, { id: 2 }] }));
  const expire = vi.fn();
  const done = waitForAnnouncements(store, new Set([1]), expire);
  store.setState({ announcements: [{ id: 2 }] });
  await done;
  expect(expire).not.toHaveBeenCalled();
});
it('continues if narration was already dismissed', async () => {
  const store = createStore(() => ({ announcements: [] as { id: number }[] }));
  await waitForAnnouncements(store, new Set([1]), vi.fn());
});
it('releases a saved policy when audio never finishes', async () => {
  vi.useFakeTimers();
  const store = createStore(() => ({ announcements: [{ id: 1 }] }));
  const expire = vi.fn();
  const done = waitForAnnouncements(store, new Set([1]), expire, 1000);
  await vi.advanceTimersByTimeAsync(1000);
  await done;
  expect(expire).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
