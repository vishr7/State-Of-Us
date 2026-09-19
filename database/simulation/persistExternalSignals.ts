/**
 * Database write for scraped external signals. `id` is a content hash (see
 * lib/signals/pipeline.ts), so re-ingesting the same document under the same
 * model/prompt version is a no-op rather than a duplicate error.
 */
import type { Pool } from 'pg';
import type { ExternalSignal } from '../../lib/signals/types';

export interface PersistExternalSignalsResult {
  inserted: number;
  skipped: number;
}

export async function persistExternalSignals(
  pool: Pool,
  signals: ExternalSignal[]
): Promise<PersistExternalSignalsResult> {
  let inserted = 0;
  let skipped = 0;
  for (const signal of signals) {
    const result = await pool.query(
      `insert into external_signals (
         id, document_id, category, headline, summary,
         geography_name, geography_scope, event_date, status,
         evidence, source, provenance
       ) values (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10::jsonb, $11::jsonb, $12::jsonb
       )
       on conflict (id) do nothing`,
      [
        signal.id,
        signal.documentId,
        signal.category,
        signal.headline,
        signal.summary,
        signal.geography.name,
        signal.geography.scope,
        signal.eventDate,
        signal.status,
        JSON.stringify(signal.evidence),
        JSON.stringify(signal.source),
        JSON.stringify(signal.provenance),
      ]
    );
    if (result.rowCount) inserted += result.rowCount;
    else skipped += 1;
  }
  return { inserted, skipped };
}
