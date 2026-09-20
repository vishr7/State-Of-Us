import { beforeEach, expect, it, vi } from 'vitest';
const { getCity } = vi.hoisted(() => ({ getCity: vi.fn() }));
vi.mock('@/src/lib/apiClient', () => ({ getCity }));
import { recoverTurn } from '../recoverTurn';
beforeEach(() => vi.clearAllMocks());
it.each([5, 8, 0])('refreshes a changed server turn (%i), including a reset', async current_turn => {
  getCity.mockResolvedValue({ current_turn });
  const refresh = vi.fn().mockResolvedValue(undefined);
  await expect(recoverTurn('city', 4, refresh)).resolves.toBe(true);
  expect(refresh).toHaveBeenCalledOnce();
  expect(getCity).toHaveBeenCalledWith('city');
});
it('does not hide an unresolved turn failure', async () => {
  getCity.mockResolvedValue({ current_turn: 4 });
  const refresh = vi.fn();
  await expect(recoverTurn('city', 4, refresh)).resolves.toBe(false);
  expect(refresh).not.toHaveBeenCalled();
});
it('does not report recovery when refresh fails', async () => {
  getCity.mockResolvedValue({ current_turn: 5 });
  await expect(recoverTurn('city', 4, async () => { throw new Error('offline'); })).rejects.toThrow('offline');
});
