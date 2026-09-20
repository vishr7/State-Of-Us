import { NextResponse } from 'next/server';
import { getPool } from '@database/lib/db';
import type { SimulationState } from '@database/types/database';

/**
 * GET /api/city/:id/snapshot?turn=N — the canonical city/neighborhoods/
 * residents state as of the end of turn N (default 0, the city's starting
 * point). Read-only; lets the client diff "now" against day one without
 * having to keep its own copy of turn-0 stats around.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const turnParam = new URL(request.url).searchParams.get('turn');
  const turn = turnParam === null ? 0 : Number(turnParam);
  if (!Number.isInteger(turn) || turn < 0) {
    return NextResponse.json({ error: '"turn" must be a non-negative integer' }, { status: 400 });
  }
  try {
    const result = await getPool().query<{ state: SimulationState }>(
      'select state from simulation_snapshots where city_id = $1 and turn = $2',
      [id, turn]
    );
    const state = result.rows[0]?.state;
    if (!state) {
      return NextResponse.json({ error: `No snapshot recorded for city ${id} at turn ${turn}` }, { status: 404 });
    }
    return NextResponse.json(state);
  } catch (err) {
    console.error('GET /api/city/[id]/snapshot failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
