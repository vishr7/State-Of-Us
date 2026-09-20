import { NextResponse } from 'next/server';
import { getPool } from '@database/lib/db';
import type { CityEventRow } from '@database/types/database';
import { resolveEvents } from '@database/simulation/resolveEvents';
import { CityNotFoundError } from '@database/simulation/errors';
import { runSignalPipeline } from '@/lib/signals/pipeline';
import { persistExternalSignals } from '@database/simulation/persistExternalSignals';

/**
 * GET /api/city/:id/events — every event already applied to this city, most
 * recent first. Read-only audit feed for the UI; does not run the pipeline.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await getPool().query<CityEventRow>(
      'select * from city_events where city_id = $1 order by created_at desc limit 100',
      [id]
    );
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error('GET /api/city/[id]/events failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/city/:id/events — runs the full pipeline once:
 *
 *   scrape + extract fresh `external_signals` (best-effort; a scrape/extract
 *   failure just means no new candidates this run, not a failed request) ->
 *   candidates not yet used for this city are offered to the Gemini
 *   supervisor, which picks up to 5 -> each pick goes to Nemotron to decide
 *   its `PolicyEffects`, which are applied to the city/neighborhoods/
 *   residents (population included, via the same deterministic interpreter
 *   policies use).
 *
 * Route handler only — the scrape/ingest step delegates to
 * lib/signals/pipeline.ts + database/simulation/persistExternalSignals.ts,
 * and the supervisor/effects/apply step lives entirely in
 * database/simulation/resolveEvents.ts, inside one transaction.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let ingest: { inserted: number; skipped: number } | undefined;
  let ingestError: string | undefined;
  try {
    const pipelineResult = await runSignalPipeline();
    ingest = await persistExternalSignals(getPool(), pipelineResult.signals);
  } catch (err) {
    // Scraping is best-effort: fall back to whatever external_signals are
    // already on hand rather than failing the whole request.
    console.error('POST /api/city/[id]/events: signal ingestion failed', err);
    ingestError = err instanceof Error ? err.message : 'Unknown ingestion error';
  }

  try {
    const result = await resolveEvents(id);
    return NextResponse.json(
      {
        city: result.city,
        events: result.events,
        skipped: result.skipped,
        supervisor_notice: result.supervisorNotice,
        ingest,
        ingest_error: ingestError,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    if (err instanceof CityNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error('POST /api/city/[id]/events failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
