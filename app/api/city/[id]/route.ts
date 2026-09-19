import { NextResponse } from 'next/server';
import { getPool } from '@database/lib/db';
import type { City } from '@database/types/database';

/** GET /api/city/:id — current canonical city state. Read-only, no simulation logic here. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getPool().query<City>('select * from cities where id = $1', [params.id]);
    const city = result.rows[0];

    if (!city) {
      return NextResponse.json({ error: `City ${params.id} not found` }, { status: 404 });
    }

    return NextResponse.json({
      id: city.id,
      name: city.name,
      current_turn: city.current_turn,
      population: city.population,
      treasury: city.treasury,
      revenue: city.revenue,
      expenses: city.expenses,
      debt: city.debt,
      happiness: city.happiness,
      approval: city.approval,
      unemployment: city.unemployment,
      average_rent: city.average_rent,
    });
  } catch (err) {
    console.error('GET /api/city/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
