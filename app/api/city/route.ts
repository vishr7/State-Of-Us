import { NextResponse } from 'next/server';
import { getPool } from '@database/lib/db';

/** GET /api/city — lists the available cities so the client can find one by name without hard-coding a UUID. Read-only. */
export async function GET() {
  try {
    const result = await getPool().query<{ id: string; name: string; current_turn: number }>(
      'select id, name, current_turn from cities order by name'
    );
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error('GET /api/city failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
