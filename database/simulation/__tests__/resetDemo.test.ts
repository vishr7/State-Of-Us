import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), residents: vi.fn(), neighborhoods: vi.fn(), city: vi.fn() }));
vi.mock('../../lib/db', () => ({ withTransaction: (work: (client: unknown) => Promise<unknown>) => work({ query: mocks.query }) }));
vi.mock('../persistTurnState', () => ({ persistResidents: mocks.residents, persistNeighborhoods: mocks.neighborhoods, persistCity: mocks.city }));
import { resetDemo } from '../resetDemo';

const baseline = {
  version: 1, turn: 0, city: { id: 'demo-city', treasury: 500000, current_turn: 0 },
  residents: [{ id: 'resident', happiness: 70 }], neighborhoods: [{ id: 'district', jobs: 200 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [] });
});

describe('demo reset', () => {
  it('restores the starting finances and people and deletes only this city’s progress', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 'demo-city', current_turn: 8, treasury: 12 }] });
    mocks.query.mockResolvedValueOnce({ rows: [{ state: baseline }] });
    await expect(resetDemo('demo-city')).resolves.toEqual({ turn: 0 });
    expect(mocks.query.mock.calls[0][0]).toContain('for update');
    expect(mocks.city).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ treasury: 500000, current_turn: 0 }));
    expect(mocks.residents).toHaveBeenCalledWith(expect.anything(), baseline.residents);
    expect(mocks.neighborhoods).toHaveBeenCalledWith(expect.anything(), baseline.neighborhoods);
    const deletes = mocks.query.mock.calls.filter(([sql]) => sql.startsWith('delete'));
    expect(deletes).toHaveLength(3);
    for (const [sql, params] of deletes) {
      expect(sql).toContain('where city_id=$1');
      expect(params).toEqual(['demo-city']);
    }
    expect(deletes.at(-1)?.[0]).toContain('turn>0');
  });

  it('clears events when the optional event table exists', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('from cities')) return { rows: [{ id: 'demo-city', current_turn: 8 }] };
      if (sql.includes('select state')) return { rows: [{ state: baseline }] };
      if (sql.includes('to_regclass')) return { rows: [{ present: 'city_events' }] };
      return { rows: [] };
    });
    await resetDemo('demo-city');
    expect(mocks.query).toHaveBeenCalledWith('delete from city_events where city_id=$1', ['demo-city']);
  });

  it('leaves all progress intact if the original snapshot is missing', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 'demo-city', current_turn: 8 }] });
    await expect(resetDemo('demo-city')).rejects.toThrow('starting snapshot');
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.city).not.toHaveBeenCalled();
  });

  it.each([0, 1, 9, 30])('resets the latest saved day %i regardless of the browser day', async currentTurn => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 'demo-city', current_turn: currentTurn }] });
    mocks.query.mockResolvedValueOnce({ rows: [{ state: baseline }] });
    await expect(resetDemo('demo-city')).resolves.toEqual({ turn: 0 });
    expect(mocks.query.mock.calls[0][0]).toContain('for update');
    expect(mocks.city).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ current_turn: 0, treasury: 500000 }));
  });

  it('rejects a snapshot belonging to a different city', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 'demo-city', current_turn: 8 }] });
    mocks.query.mockResolvedValueOnce({ rows: [{ state: { ...baseline, city: { id: 'other-city' } } }] });
    await expect(resetDemo('demo-city')).rejects.toThrow('starting snapshot');
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
});
