import { beforeEach, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../lib/db', () => ({
  withTransaction: (work: (db: { query: typeof query }) => unknown) => work({ query }),
  getPool: () => ({ query }),
}));
import { chooseGameDayCandidate } from '../chooseGameDayCandidate';

beforeEach(() => query.mockReset());

it.each([undefined, { id: 'day', selected_ids: ['current-choice'] }])(
  'returns a recoverable conflict for a missing or replaced slate (%j)', async day => {
    query.mockResolvedValueOnce({ rows: [{ id: 'city', current_turn: 0 }] })
      .mockResolvedValueOnce({ rows: day ? [day] : [] });
    await expect(chooseGameDayCandidate('city', 1, 'old-choice')).rejects.toMatchObject({ status: 409 });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.some(([sql]) => /^\s*(insert|update|delete)\b/i.test(sql))).toBe(false);
  },
);

it('returns the saved decision on a repeated submission without applying it twice', async () => {
  const saved = { id: 'decision', candidate_id: 'chosen' };
  query.mockResolvedValueOnce({ rows: [{ id: 'city', current_turn: 2 }] })
    .mockResolvedValueOnce({ rows: [{ id: 'day', selected_ids: ['chosen'] }] })
    .mockResolvedValueOnce({ rows: [saved] });
  await expect(chooseGameDayCandidate('city', 1, 'chosen')).resolves.toEqual(saved);
  expect(query).toHaveBeenCalledTimes(3);
});
