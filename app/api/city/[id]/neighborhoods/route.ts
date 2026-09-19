import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import type { Neighborhood } from '@/types/database';

/** GET /api/city/:id/neighborhoods — read-only. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getPool().query<Neighborhood>(
      'select * from neighborhoods where city_id = $1 order by name',
      [params.id]
    );
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error('GET /api/city/[id]/neighborhoods failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
