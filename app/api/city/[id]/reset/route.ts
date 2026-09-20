import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DemoResetError, resetDemo } from '@database/simulation/resetDemo';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Reset must be requested from this app.' }, { status: 403 });
  }
  try {
    const { id } = await params;
    z.uuid().parse(id);
    // Accept the old client's turn field during hot reloads, but a full reset
    // applies to the latest locked state rather than a particular day.
    z.object({ expected_turn: z.number().int().nonnegative().optional() }).strict().parse(await request.json());
    return NextResponse.json(await resetDemo(id));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: 'A valid city and reset request are required.' }, { status: 400 });
    }
    if (error instanceof DemoResetError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Demo reset failed', error);
    return NextResponse.json({ error: 'Could not reset the demo. Your progress was kept; please try again.' }, { status: 500 });
  }
}
