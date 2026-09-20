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
    const body = z.object({ expected_turn: z.number().int().nonnegative() }).strict().parse(await request.json());
    return NextResponse.json(await resetDemo(id, body.expected_turn));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: 'A valid city and current turn are required.' }, { status: 400 });
    }
    if (error instanceof DemoResetError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Demo reset failed', error);
    return NextResponse.json({ error: 'Could not reset the demo. Your progress was kept; please try again.' }, { status: 500 });
  }
}
