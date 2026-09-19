import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import type { City, Decision, Policy } from '@/types/database';

interface CreateDecisionBody {
  policy_id?: unknown;
  player_reasoning?: unknown;
}

const UNIQUE_VIOLATION = '23505';

/**
 * POST /api/city/:id/decisions — queues a policy decision for the city's
 * CURRENT (not-yet-resolved) turn. Only records the row; it has no effect on
 * canonical state until POST /api/city/:id/resolve-turn applies it — this
 * route never touches the simulation engine.
 *
 * Body: { policy_id: string, player_reasoning?: string }
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: CreateDecisionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const policyId = body.policy_id;
  if (typeof policyId !== 'string' || policyId.length === 0) {
    return NextResponse.json({ error: '"policy_id" is required and must be a non-empty string' }, { status: 400 });
  }

  const playerReasoning = body.player_reasoning;
  if (playerReasoning !== undefined && playerReasoning !== null && typeof playerReasoning !== 'string') {
    return NextResponse.json({ error: '"player_reasoning" must be a string if provided' }, { status: 400 });
  }

  const pool = getPool();
  let currentTurn: number | undefined;

  try {
    const cityResult = await pool.query<City>('select * from cities where id = $1', [params.id]);
    const city = cityResult.rows[0];
    if (!city) {
      return NextResponse.json({ error: `City ${params.id} not found` }, { status: 404 });
    }
    currentTurn = city.current_turn;

    const policyResult = await pool.query<Policy>('select * from policies where id = $1', [policyId]);
    const policy = policyResult.rows[0];
    if (!policy) {
      return NextResponse.json({ error: `Policy ${policyId} not found` }, { status: 404 });
    }

    const insertResult = await pool.query<Decision>(
      `insert into decisions (city_id, policy_id, turn, player_reasoning)
       values ($1, $2, $3, $4)
       returning *`,
      [city.id, policy.id, city.current_turn, playerReasoning ?? null]
    );

    return NextResponse.json(insertResult.rows[0], { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // decisions_city_turn_policy_key: this exact policy was already
      // decided for this city at this turn.
      return NextResponse.json(
        {
          error: `A decision for policy ${policyId} already exists for city ${params.id} at turn ${currentTurn}`,
        },
        { status: 409 }
      );
    }
    console.error('POST /api/city/[id]/decisions failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === UNIQUE_VIOLATION;
}
