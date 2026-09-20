/**
 * Orchestrates the scrape -> Gemini supervisor -> Nemotron -> population
 * pipeline for one city:
 *
 *   load scraped external_signals not yet turned into an event for this city
 *     -> Gemini picks up to `limit` of them (the "supervisor")
 *     -> for each pick, Nemotron decides its PolicyEffects
 *     -> applyPolicyEffects (the same pure interpreter policies use) applies
 *        them to city/neighborhoods/residents, in memory
 *     -> recompute derived aggregates (population included) from residents
 *     -> persist residents/neighborhoods/city + one city_events audit row
 *        per successfully-applied event
 *
 * Runs in one transaction, like resolveTurn.ts: if persistence fails, nothing
 * is half-applied. Unlike resolveTurn.ts, this does not advance current_turn
 * or write a simulation_snapshots row — events are a side channel that moves
 * the same canonical state, not a turn boundary.
 */
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTransaction } from '../lib/db';
import type { City, Neighborhood, Resident, ExternalSignalRow } from '../types/database';
import type { ExternalSignal } from '../../lib/signals/types';
import { selectEventCandidates } from '../../lib/ai/gemini';
import { decideEventEffects } from '../../lib/ai/nemotron';
import { applyPolicyEffects } from './applyPolicyEffects';
import { recalculateCityAggregates, recalculateNeighborhoodAggregates } from './recalculateAggregates';
import { persistCity, persistNeighborhoods, persistResidents } from './persistTurnState';
import { CityNotFoundError, MalformedPolicyEffectsError, UnsupportedEffectsVersionError } from './errors';

export interface ResolvedEvent {
  id: string;
  signalId: string;
  category: string;
  headline: string;
  summary: string;
  supervisorRationale: string;
  supervisorSource: 'gemini' | 'scripted';
  effects: unknown;
  effectsSource: 'nemotron' | 'scripted';
  effectsModel: string | null;
  effectsNotice?: string;
}

export interface ResolveEventsResult {
  city: City;
  events: ResolvedEvent[];
  skipped: number;
  supervisorNotice?: string;
}

/** Number of most-recently-scraped, not-yet-used candidates offered to the supervisor. */
const CANDIDATE_POOL_SIZE = 30;

function rowToExternalSignal(row: ExternalSignalRow & { event_date_text: string | null }): ExternalSignal {
  return {
    id: row.id,
    documentId: row.document_id,
    category: row.category,
    headline: row.headline,
    summary: row.summary,
    geography: { name: row.geography_name, scope: row.geography_scope },
    eventDate: row.event_date_text,
    status: row.status,
    evidence: row.evidence as ExternalSignal['evidence'],
    source: row.source as ExternalSignal['source'],
    provenance: row.provenance as ExternalSignal['provenance'],
  };
}

async function loadCandidates(client: PoolClient, cityId: string): Promise<ExternalSignal[]> {
  const result = await client.query(
    `select s.*, to_char(s.event_date, 'YYYY-MM-DD') as event_date_text
       from external_signals s
       where not exists (
         select 1 from city_events e
         where e.city_id = $1 and e.external_signal_id = s.id
       )
       order by s.created_at desc
       limit $2`,
    [cityId, CANDIDATE_POOL_SIZE]
  );
  return result.rows.map(rowToExternalSignal);
}

async function insertCityEvent(
  client: PoolClient,
  cityId: string,
  turn: number,
  event: ResolvedEvent
): Promise<void> {
  await client.query(
    `insert into city_events (
       id, city_id, external_signal_id, turn, category, headline, summary,
       supervisor_rationale, supervisor_source, effects, effects_source, effects_model
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)`,
    [
      event.id,
      cityId,
      event.signalId,
      turn,
      event.category,
      event.headline,
      event.summary,
      event.supervisorRationale,
      event.supervisorSource,
      JSON.stringify(event.effects),
      event.effectsSource,
      event.effectsModel,
    ]
  );
}

/**
 * Runs the full pipeline for `cityId` and applies up to `limit` new events.
 * Safe to call with an empty candidate pool (returns `events: []`).
 */
export async function resolveEvents(cityId: string, limit = 5): Promise<ResolveEventsResult> {
  return withTransaction(async (client) => {
    const cityResult = await client.query<City>('select * from cities where id = $1 for update', [cityId]);
    const initialCity = cityResult.rows[0];
    if (!initialCity) throw new CityNotFoundError(`City ${cityId} does not exist`);

    const neighborhoodsResult = await client.query<Neighborhood>(
      'select * from neighborhoods where city_id = $1 order by name',
      [cityId]
    );
    const initialNeighborhoods = neighborhoodsResult.rows;
    const neighborhoodIds = initialNeighborhoods.map((n) => n.id);
    const initialResidents = neighborhoodIds.length
      ? (
          await client.query<Resident>(
            'select * from residents where neighborhood_id = any($1::uuid[]) order by id',
            [neighborhoodIds]
          )
        ).rows
      : [];

    const candidates = await loadCandidates(client, cityId);
    const selection = await selectEventCandidates(candidates, limit);

    let city = initialCity;
    let neighborhoods = initialNeighborhoods;
    let residents = initialResidents;
    const events: ResolvedEvent[] = [];
    let skipped = 0;

    const candidateById = new Map(candidates.map((c) => [c.id, c]));

    for (const pick of selection.picks) {
      const signal = candidateById.get(pick.signalId);
      if (!signal) { skipped += 1; continue; }

      const decision = await decideEventEffects({
        cityName: city.name,
        neighborhoodNames: neighborhoods.map((n) => n.name),
        event: { category: signal.category, headline: signal.headline, summary: signal.summary, geography: signal.geography, status: signal.status },
      });

      try {
        const result = applyPolicyEffects({ city, neighborhoods, residents, effects: decision.effects });
        city = result.city;
        neighborhoods = result.neighborhoods;
        residents = result.residents;
      } catch (error) {
        // A malformed/out-of-contract Nemotron response should not fail the
        // whole batch — skip just this event and keep the other four.
        if (error instanceof MalformedPolicyEffectsError || error instanceof UnsupportedEffectsVersionError) {
          console.error('Skipping event with invalid effects:', signal.id, error.message);
          skipped += 1;
          continue;
        }
        throw error;
      }

      events.push({
        id: randomUUID(),
        signalId: signal.id,
        category: signal.category,
        headline: signal.headline,
        summary: signal.summary,
        supervisorRationale: pick.rationale,
        supervisorSource: selection.source,
        effects: decision.effects,
        effectsSource: decision.source,
        effectsModel: decision.model,
        effectsNotice: decision.notice,
      });
    }

    if (events.length > 0) {
      neighborhoods = neighborhoods.map((n) => recalculateNeighborhoodAggregates(n, residents));
      city = recalculateCityAggregates(city, residents);

      await persistResidents(client, residents);
      await persistNeighborhoods(client, neighborhoods);
      await persistCity(client, city);

      for (const event of events) {
        await insertCityEvent(client, cityId, city.current_turn, event);
      }
    }

    return { city, events, skipped, supervisorNotice: selection.notice };
  });
}
