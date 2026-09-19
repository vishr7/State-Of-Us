import { NextResponse } from 'next/server';
import { resolveTurn } from '@database/simulation/resolveTurn';
import {
  CityNotFoundError,
  MalformedPolicyEffectsError,
  PolicyNotFoundError,
  SnapshotAlreadyExistsError,
  UnsupportedEffectsVersionError,
} from '@database/simulation/errors';

/**
 * POST /api/city/:id/resolve-turn — advances one turn.
 *
 * Route handler only: validates the id exists as a path param and delegates
 * to the simulation service. All simulation logic (loading state, applying
 * policy effects, recomputing aggregates, persisting, snapshotting) lives in
 * database/simulation/resolveTurn.ts, inside one database transaction.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await resolveTurn(params.id);

    return NextResponse.json({
      city: result.city,
      previous_turn: result.previousTurn,
      turn: result.newTurn,
      applied_decisions: result.appliedDecisions,
    });
  } catch (err) {
    if (err instanceof CityNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }

    if (err instanceof SnapshotAlreadyExistsError) {
      // The requested turn was already resolved — a conflict with current
      // state, not a bad request.
      return NextResponse.json({ error: err.message }, { status: 409 });
    }

    if (
      err instanceof PolicyNotFoundError ||
      err instanceof MalformedPolicyEffectsError ||
      err instanceof UnsupportedEffectsVersionError
    ) {
      // These indicate bad *data* (a decision or policy row that doesn't
      // satisfy the contract), not a bad request from the frontend — surface
      // as a server error, but with the descriptive message logged for
      // debugging rather than swallowed.
      console.error('POST /api/city/[id]/resolve-turn: data integrity error', err);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    console.error('POST /api/city/[id]/resolve-turn failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
