import { NextResponse } from 'next/server';
import { getPool } from '@database/lib/db';
import type { Policy } from '@database/types/database';

/** GET /api/policies — the global policy catalogue, read-only. */
export async function GET() {
  try {
    const result = await getPool().query<Policy>('select * from policies order by category, name');
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error('GET /api/policies failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
