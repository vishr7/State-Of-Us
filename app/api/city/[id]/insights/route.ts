import { NextResponse } from 'next/server';
import { z } from 'zod';
import { insightRequestSchema } from '@/lib/ai/contracts';
import { loadInsightFacts } from '@/lib/ai/context';
import { generateInsight } from '@/lib/ai/nemotron';
export const runtime = 'nodejs';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid city ID.' }, { status: 400 });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Use this endpoint from the game.' }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 3000) return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
  let parsed;
  try { parsed = insightRequestSchema.safeParse(JSON.parse(raw)); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  try {
    const facts = await loadInsightFacts(id, parsed.data);
    return NextResponse.json(await generateInsight(facts), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.endsWith('_NOT_FOUND')) return NextResponse.json({ error: 'City, policy, or resident not found.' }, { status: 404 });
    console.error('City insights failed:', message.slice(0,180));
    return NextResponse.json({ error: 'City data is unavailable. Your simulation has not been changed.' }, { status: 503 });
  }
}
