import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import type { Resident } from '@/types/database';

/** GET /api/city/:id/residents — read-only. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getPool().query<Resident>(
      `select r.* from residents r
       join neighborhoods n on n.id = r.neighborhood_id
       where n.city_id = $1
       order by r.id`,
      [params.id]
    );
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error('GET /api/city/[id]/residents failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
