import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { getPool, withTransaction } from "../lib/db";
import type { City, ExternalSignalRow, Policy, SimulationState } from "../types/database";
import { persistExternalSignals } from "../simulation/persistExternalSignals";
import { bindExecutableActions, policyFingerprint } from "../simulation/bindExecutableActions";
import { ingestFeeds } from "../../lib/signals/ingest-feed";
import { SIGNAL_FEEDS } from "../../lib/signals/feeds";
import { externalSignalSchema } from "../../lib/signals/decisions";
import { readJson } from "../../lib/signals/processed";
import { generateEventCandidates, GENERATOR_PROMPT_VERSION } from "../../lib/signals/generate-event-candidates";
import { selectEventsWithGemini, SELECTOR_PROMPT_VERSION } from "../../lib/signals/select-events-with-gemini";
import { generatedEventSchema, generatedSlateSchema } from "../../lib/signals/generated-events";
import type { GeminiClient } from "../../lib/agents/gemini";
import { GameplayError, type GameDayResponse, type GameDayRow } from "./contracts";

export function gameDayResponse(row: GameDayRow): GameDayResponse {
  const candidates = z.array(generatedEventSchema).parse(row.candidate_pool);
  const decisions = row.selected_ids.map((id) => { const candidate = candidates.find((item) => item.id === id); if (!candidate?.executable) throw new Error("Invalid persisted slate."); return candidate; });
  return { gameDayId: row.id, status: row.status, slate: generatedSlateSchema.parse({ cityId: row.city_id, turn: row.turn, candidatePoolIds: candidates.map((candidate) => candidate.id), selectedDecisionIds: row.selected_ids, decisions, generatedAt: new Date(row.completed_at ?? row.created_at).toISOString(), selectionVersion: SELECTOR_PROMPT_VERSION }) };
}
export async function getGameDay(cityId: string, turn: number) {
  const row = (await getPool().query<GameDayRow>("select * from game_days where city_id=$1 and turn=$2", [cityId, turn])).rows[0];
  if (!row) throw new GameplayError("Game day not found.", 404);
  if (row.status !== "ready") throw new GameplayError(`Game day is ${row.status}. Provider stages will not be automatically repeated.`);
  return gameDayResponse(row);
}

export interface PrepareDependencies { ingest?: typeof ingestFeeds; gemini?: GeminiClient; directory?: string }
export async function prepareGameDay(cityId: string, turn: number, dependencies: PrepareDependencies = {}): Promise<GameDayResponse> {
  const claim = await withTransaction(async (db) => {
    const city = (await db.query<City>("select * from cities where id=$1 for update", [cityId])).rows[0];
    if (!city) throw new GameplayError("City not found.", 404);
    const existing = (await db.query<GameDayRow>("select * from game_days where city_id=$1 and turn=$2", [cityId, turn])).rows[0];
    if (existing) return { city, existing, id: existing.id };
    if (city.current_turn !== turn) throw new GameplayError("Requested turn is not the city's current turn.");
    const row = (await db.query<GameDayRow>("insert into game_days(city_id,turn,status) values($1,$2,'preparing') returning *", [cityId, turn])).rows[0];
    return { city, existing: null, id: row.id };
  });
  if (claim.existing) return getGameDay(cityId, turn);
  const directory = dependencies.directory ?? join(process.cwd(), "data/signals");
  try {
    let feedWarning: string | null = null;
    try {
      const summary = await (dependencies.ingest ?? ingestFeeds)({ feeds: SIGNAL_FEEDS, directory, limit: 5 });
      if (summary.feedsFailed || summary.failed || summary.attemptsBlocked) feedWarning = "Some feed/article attempts failed or are blocked; using available validated signals.";
    } catch { feedWarning = "Feed ingestion failed; using available validated signals."; }
    if (feedWarning) console.warn(feedWarning);
    let files: string[] = [];
    try { files = await readdir(join(directory, "extracted")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    for (const file of files.filter((file) => file.endsWith(".json")).sort()) {
      const batch = z.object({ signals: z.array(externalSignalSchema) }).parse(await readJson(join(directory, "extracted", file)));
      await persistExternalSignals(getPool(), batch.signals);
    }
    const rows = (await getPool().query<ExternalSignalRow>("select external_signals.*, event_date::text as event_date from external_signals where lower(geography_name)=lower($1) order by external_signals.event_date desc nulls last, id", [claim.city.name])).rows;
    const signals = rows.map((row) => externalSignalSchema.parse({ id: row.id, documentId: row.document_id, category: row.category, headline: row.headline, summary: row.summary, geography: { name: row.geography_name, scope: row.geography_scope }, eventDate: row.event_date, status: row.status, evidence: row.evidence, source: row.source, provenance: row.provenance }));
    const { created_at: _created, updated_at: _updated, ...cityContext } = claim.city;
    const pool = await generateEventCandidates({ cityId, turn, signals, cityContext: cityContext as SimulationState["city"], targetCount: 10 }, dependencies.gemini);
    const catalog = (await getPool().query<Policy>("select * from policies order by id")).rows;
    const bound = bindExecutableActions(pool, catalog);
    const hashes = Object.fromEntries(catalog.filter((policy) => bound.some((candidate) => candidate.policyId === policy.id)).map((policy) => [policy.id, policyFingerprint(policy)]));
    const metadata = { generatorModel: process.env.GEMINI_MODEL ?? null, generatorPromptVersion: GENERATOR_PROMPT_VERSION, selectorModel: process.env.GEMINI_MODEL ?? null, selectorPromptVersion: SELECTOR_PROMPT_VERSION, feedWarning };
    // Retain the validated pool even if selection fails later.
    await getPool().query("update game_days set candidate_pool=$2::jsonb,policy_hashes=$3::jsonb,generation_metadata=$4::jsonb where id=$1", [claim.id, JSON.stringify(bound), JSON.stringify(hashes), JSON.stringify(metadata)]);
    const previous = (await getPool().query<{ selected_ids: string[] }>("select selected_ids from game_days where city_id=$1 and status='ready' and turn<$2", [cityId, turn])).rows.flatMap((row) => row.selected_ids);
    const selected = await selectEventsWithGemini({ candidates: bound.filter((candidate) => candidate.executable), cityContext, previouslyShownIds: previous }, dependencies.gemini);
    return await withTransaction(async (db) => {
      const current = (await db.query<City>("select * from cities where id=$1 for update", [cityId])).rows[0];
      if (current.current_turn !== turn) throw new GameplayError("Turn advanced during game-day preparation.");
      const row = (await db.query<GameDayRow>("update game_days set selected_ids=$2::jsonb,status='ready',completed_at=now() where id=$1 returning *", [claim.id, JSON.stringify(selected)])).rows[0];
      return gameDayResponse(row);
    });
  } catch (error) {
    await getPool().query("update game_days set status='failed',error=$2 where id=$1", [claim.id, "Preparation failed. Inspect server configuration or provider validation; no automatic provider retry."]);
    if (error instanceof GameplayError) throw error;
    const failure = new GameplayError("Game-day preparation failed; see server/provider configuration and persisted status.", 502);
    failure.cause = error;
    throw failure;
  }
}
