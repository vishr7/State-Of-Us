import { withTransaction } from '../lib/db';
import type { City, SimulationState } from '../types/database';
import { persistCity, persistNeighborhoods, persistResidents } from './persistTurnState';

export class DemoResetError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

/** Restore the seeded world atomically, retaining its original Day 1 snapshot. */
export async function resetDemo(cityId: string) {
  return withTransaction(async client => {
    const city = (await client.query<City>('select * from cities where id=$1 for update', [cityId])).rows[0];
    if (!city) throw new DemoResetError('City not found.', 404);
    // Reset always restores the baseline, even when the browser's day is stale.
    // The row lock serializes this with any turn currently being resolved.
    const baseline = (await client.query<{ state: SimulationState }>(
      'select state from simulation_snapshots where city_id=$1 and turn=0', [cityId],
    )).rows[0]?.state;
    if (!baseline || baseline.version !== 1 || baseline.city.id !== cityId || baseline.turn !== 0
      || !Array.isArray(baseline.residents) || !Array.isArray(baseline.neighborhoods)) {
      throw new DemoResetError('The starting snapshot is unavailable. Nothing was reset.');
    }

    // Deleting decisions also removes their reaction runs and resident reactions.
    await client.query('delete from decisions where city_id=$1', [cityId]);
    await client.query('delete from game_days where city_id=$1', [cityId]);
    // Older local databases predate the optional news-event migration.
    // Check before issuing SQL: a missing relation aborts the whole transaction.
    const eventsTable = (await client.query<{ present: string | null }>("select to_regclass('public.city_events')::text as present")).rows[0]?.present;
    if (eventsTable) await client.query('delete from city_events where city_id=$1', [cityId]);
    await client.query('delete from simulation_snapshots where city_id=$1 and turn>0', [cityId]);
    await persistResidents(client, baseline.residents);
    await persistNeighborhoods(client, baseline.neighborhoods);
    await persistCity(client, { ...city, ...baseline.city, current_turn: 0 });
    return { turn: 0 };
  });
}
