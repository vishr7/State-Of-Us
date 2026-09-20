import { after, NextResponse } from 'next/server';
import { resolveTurn } from '@database/simulation/resolveTurn';
import { z } from 'zod';
import { findChosenDecision } from '@database/gameplay/chooseGameDayCandidate';
import { readGameDayOutcome, generateGameDayReactions } from '@database/gameplay/resolveGameDay';
import { GameplayError } from '@database/gameplay/contracts';
import {
  CityNotFoundError,
  MalformedPolicyEffectsError,
  PolicyNotFoundError,
  SnapshotAlreadyExistsError,
  UnsupportedEffectsVersionError,
  ExpectedTurnError,
} from '@database/simulation/errors';

/**
 * POST /api/city/:id/resolve-turn — advances one turn.
 *
 * Route handler only: validates the id exists as a path param and delegates
 * to the simulation service. All simulation logic (loading state, applying
 * policy effects, recomputing aggregates, persisting, snapshotting) lives in
 * database/simulation/resolveTurn.ts, inside one database transaction.
 */
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    z.uuid().parse(id);
    const { expected_turn } = z.object({ expected_turn: z.number().int().nonnegative() }).strict().parse(await request.json());
    const chosen = await findChosenDecision(id, expected_turn);
    if (chosen) {
      await resolveTurn(id, expected_turn);
      const outcome = await readGameDayOutcome(id, expected_turn);
      after(async () => {
        try { await generateGameDayReactions(id, expected_turn); }
        catch { console.error('Background resident reactions failed; turn remains saved.'); }
      });
      return NextResponse.json({ city: outcome.after.city, previous_turn: expected_turn, turn: expected_turn + 1, applied_decisions: outcome.after.applied_decisions, outcome });
    }
    const result = await resolveTurn(id, expected_turn);

    return NextResponse.json({
      city: result.city,
      previous_turn: result.previousTurn,
      turn: result.newTurn,
      applied_decisions: result.appliedDecisions,
    });
  } catch (err) {
    if (err instanceof z.ZodError || err instanceof SyntaxError) return NextResponse.json({ error: 'A valid expected_turn is required.' }, { status: 400 });
    if (err instanceof ExpectedTurnError || err instanceof GameplayError) return NextResponse.json({ error: err.message }, { status: err instanceof GameplayError ? err.status : 409 });
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
