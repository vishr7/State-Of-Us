import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { GeminiClient } from "../../../lib/agents/gemini";
import type { ExternalSignal } from "../../../lib/signals/types";
import type { Policy, SimulationState } from "../../types/database";
import { ingestFeeds } from "../../../lib/signals/ingest-feed";
import { prepareGameDay, getGameDay } from "../prepareGameDay";
import { chooseGameDayCandidate } from "../chooseGameDayCandidate";
import { resolveGameDay } from "../resolveGameDay";
import { applyPolicyEffects } from "../../simulation/applyPolicyEffects";
import { recalculateCityAggregates, recalculateNeighborhoodAggregates } from "../../simulation/recalculateAggregates";
import { TRANSIT_POLICY_ID } from "../../simulation/bindExecutableActions";

const holder = vi.hoisted(() => ({ db: null as unknown as PGlite }));
vi.mock("../../lib/db", () => {
  const wrap = (db: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }> }) => ({ query: async (sql: string, values?: unknown[]) => { const result = await db.query(sql, values); return { ...result, rowCount: result.affectedRows ?? result.rows.length }; } });
  return { getPool: () => wrap(holder.db), withTransaction: (fn: (client: PoolClient) => Promise<unknown>) => holder.db.transaction((tx) => fn(wrap(tx) as unknown as PoolClient)) };
});

const cityId = "77777777-7777-4777-8777-000000000001";
let directory: string;
beforeEach(async () => {
  vi.stubEnv("GEMINI_MODEL", "mock-gemini"); vi.stubEnv("NEMOTRON_MODEL", "mock-nemotron");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("External network is forbidden in tests"); }));
  holder.db = await PGlite.create({ parsers: { 1700: Number } });
  for (const file of (await readdir("database/supabase/migrations")).filter((file) => file.endsWith(".sql")).sort()) await holder.db.exec(await readFile(join("database/supabase/migrations", file), "utf8"));
  await holder.db.exec(await readFile("database/supabase/seed_pittsburgh.sql", "utf8"));
  directory = await mkdtemp(join(tmpdir(), "gameplay-slice-"));
}, 30000);
afterEach(async () => { await holder.db?.close(); if (directory) await rm(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function providers() {
  const quote = "Expand transit";
  const extract = vi.fn(async () => [{ category: "infrastructure" as const, headline: quote, summary: quote, geography: { name: "Pittsburgh", scope: "city" as const }, eventDate: "2026-09-19", status: "proposed" as const, evidence: [{ quote }] }]);
  const ingest = vi.fn(async (options: Parameters<typeof ingestFeeds>[0]) => ingestFeeds({ ...options, feeds: [{ url: "https://example.org/feed" }] }, {
    discover: async () => [{ title: quote, url: "https://example.org/transit", publisher: "Example", publishedAt: "2026-09-19", feedUrl: "https://example.org/feed" }],
    ingest: async () => ({ id: "document-transit", source: { title: quote, url: "https://example.org/transit", publisher: "Example", publishedAt: "2026-09-19" }, sourceType: "html", text: quote, provenance: { retrievedAt: "2026-09-19T12:00:00Z", contentHash: "content-hash", adapterVersion: "fixture" } }),
    extract, log: vi.fn(),
  }));
  const calls: string[] = [];
  const gemini: GeminiClient = async ({ schema, input }) => {
    const value = input as { signals?: ExternalSignal[]; candidates?: { id: string }[] };
    if (value.signals) {
      calls.push("generator");
      const signal = value.signals[0];
      const claim = { text: quote, evidence: [{ sourceSignalId: signal.id, evidenceIndex: 0, quote }] };
      const draft = { sourceSignalIds: [signal.id], actionKey: "expand_transit", category: "transit", title: claim, description: claim, problem: claim, proposedAction: claim, supportedBenefits: [], supportedRisks: [], affectedGroups: [] };
      return schema.parse({ candidates: [draft, { ...draft, actionKey: "unsupported_action" }] });
    }
    calls.push("selector");
    expect(value.candidates).toHaveLength(1); // unsupported action never reaches Agent 2
    return schema.parse({ selectedDecisionIds: [value.candidates![0].id] });
  };
  return { ingest, extract, gemini, calls, directory };
}

describe("real database vertical slice with mocked providers", () => {
  it("prepares, chooses, deterministically resolves, reacts after commit, and safely retries", async () => {
    const dependencies = providers();
    const prepared = await prepareGameDay(cityId, 0, dependencies);
    expect(prepared.slate.decisions).toHaveLength(5);
    expect(prepared.slate.candidatePoolIds).toHaveLength(6);
    expect(dependencies.calls).toEqual(["generator", "selector"]);
    expect((await holder.db.query("select * from external_signals")).rows).toHaveLength(1);
    expect(await getGameDay(cityId, 0)).toEqual(prepared);
    expect(await prepareGameDay(cityId, 0, dependencies)).toEqual(prepared);
    expect(dependencies.ingest).toHaveBeenCalledTimes(1);
    expect(dependencies.extract).toHaveBeenCalledTimes(1);
    const candidate = prepared.slate.decisions[0];
    const unselected = prepared.slate.candidatePoolIds.find((id) => !prepared.slate.selectedDecisionIds.includes(id))!;
    await expect(chooseGameDayCandidate(cityId, 0, unselected)).rejects.toThrow("not selected");
    const decision = await chooseGameDayCandidate(cityId, 0, candidate.id);
    expect(decision.policy_id).toBe(TRANSIT_POLICY_ID);
    expect((await chooseGameDayCandidate(cityId, 0, candidate.id)).id).toBe(decision.id);

    const react = vi.fn(async (input: Parameters<typeof import("../../../lib/agents/nemotron").generateResidentReactions>[0]) => {
      expect((await holder.db.query<{ current_turn: number }>("select current_turn from cities where id=$1", [cityId])).rows[0].current_turn).toBe(1);
      expect(input.before.turn).toBe(0); expect(input.after.turn).toBe(1);
      expect(new Set(input.residents.map(r => r.neighborhood_id)).size).toBe(input.before.neighborhoods.length);
      expect(input.residents.every((resident) => input.before.residents.some((before) => before.id === resident.id))).toBe(true);
      return input.residents.map((resident) => ({ residentId: resident.id, supportScore: 80, sentiment: "positive" as const, satisfaction: "happy" as const, reaction: "I feel better about local services.", mainReason: "Transit access improved in my neighborhood.", personalImpact: "positive" as const, neighborhoodImpact: "positive" as const, financialImpact: "neutral" as const, executionAssessment: "unknown" as const, keyFactors: [{ factor: "neighborhood.transit_access", effect: "positive" as const, reason: "Local transit access improved." }] }));
    });
    const outcome = await resolveGameDay(cityId, 0, react);
    const policy = (await holder.db.query<Policy>("select * from policies where id=$1", [TRANSIT_POLICY_ID])).rows[0];
    const before = outcome.before;
    const expected = applyPolicyEffects({ city: { ...before.city, created_at: "", updated_at: "" }, neighborhoods: before.neighborhoods, residents: before.residents, effects: policy.effects });
    const expectedCity = recalculateCityAggregates(expected.city, expected.residents);
    const { created_at: _created, updated_at: _updated, ...canonical } = expectedCity;
    expect(outcome.after.city).toEqual({ ...canonical, current_turn: 1 });
    expect(outcome.after.residents).toEqual(expected.residents);
    expect(outcome.after.neighborhoods).toEqual(expected.neighborhoods.map((n) => recalculateNeighborhoodAggregates(n, expected.residents)));
    expect(outcome.reactions.length).toBeGreaterThanOrEqual(outcome.before.neighborhoods.length); expect(outcome.reactionStatus).toBe("completed");
    expect(await resolveGameDay(cityId, 0, react)).toEqual(outcome);
    expect(react).toHaveBeenCalledTimes(1);
    const savedReactions = (await holder.db.query<{ evaluation: unknown; support: number; provenance: { promptVersion: string } }>("select * from resident_reactions order by resident_id")).rows;
    expect(savedReactions).toHaveLength(outcome.reactions.length);
    expect(savedReactions[0].evaluation).toEqual(outcome.reactions[0]);
    expect(savedReactions[0].support).toBe(0.8);
    expect(savedReactions[0].provenance.promptVersion).toBe("resident-emotion-v3");
    expect((await holder.db.query("select * from simulation_snapshots where city_id=$1", [cityId])).rows).toHaveLength(2);
    const next = await prepareGameDay(cityId, 1, dependencies);
    expect(next.slate.decisions).toHaveLength(2);
    expect(await getGameDay(cityId, 1)).toEqual(next);
    expect(next.slate.decisions.every(c => c.generation.model === 'authored-catalog')).toBe(true); // previously shown source/action IDs excluded
    expect(dependencies.extract).toHaveBeenCalledTimes(1); // feed dedupe survives the next day
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  }, 30000);

  it.each([0, 1])('persists and applies protest response %s once, with different household effects', async index => {
    await holder.db.query('update cities set current_turn=1 where id=$1', [cityId]);
    const day = await prepareGameDay(cityId, 1, providers());
    const candidate = day.slate.decisions[index];
    await chooseGameDayCandidate(cityId, 1, candidate.id);
    expect(await getGameDay(cityId, 1)).toEqual(day);
    await expect(chooseGameDayCandidate(cityId, 1, day.slate.decisions[1-index].id)).rejects.toThrow();
    const result = await resolveGameDay(cityId, 1, async () => []);
    expect(result.after.city.treasury).toBe(result.before.city.treasury - (index === 0 ? 250000 : 0) + (result.after.assessment?.grant ?? 0));
    for (const resident of result.before.residents) {
      const after = result.after.residents.find(r => r.id === resident.id)!;
      const delta = index === 0 ? resident.income < 60000 ? 6 : 2 : resident.income < 60000 ? 2 : -3;
      expect(after.happiness).toBe(Math.min(100,Math.max(0,resident.happiness + delta)));
    }
    expect((await resolveGameDay(cityId, 1, async () => [])).after).toEqual(result.after);
  }, 30000);

  it.each([0, 1])('applies outage option %s only to eligible Homewood households', async index => {
    await holder.db.query('update cities set current_turn=3 where id=$1', [cityId]);
    const day = await prepareGameDay(cityId, 3, providers());
    expect(day.slate.decisions).toHaveLength(2);
    expect(await getGameDay(cityId, 3)).toEqual(day);
    await chooseGameDayCandidate(cityId, 3, day.slate.decisions[index].id);
    const result = await resolveGameDay(cityId, 3, async () => []);
    expect(result.after.city.treasury).toBe(result.before.city.treasury - (index === 0 ? 180000 : 0));
    const homewood = result.before.neighborhoods.find(n => n.name === 'Homewood')!;
    const affected = result.before.residents.filter(r => r.neighborhood_id === homewood.id && r.income < 40000);
    expect(affected.length).toBeGreaterThan(0);
    for (const resident of result.before.residents) {
      const after = result.after.residents.find(r => r.id === resident.id)!;
      const eligible = affected.some(r => r.id === resident.id);
      expect(after.happiness).toBe(Math.min(100, Math.max(0, resident.happiness + (eligible ? index === 0 ? 5 : -8 : 0))));
      if (!eligible) expect(after).toEqual(resident);
    }
    expect((await resolveGameDay(cityId, 3, async () => [])).after).toEqual(result.after);
  }, 30000);

  it("keeps simulation committed on Nemotron failure and retries only reactions", async () => {
    const prepared = await prepareGameDay(cityId, 0, providers());
    await chooseGameDayCandidate(cityId, 0, prepared.slate.decisions[0].id);
    const failed = await resolveGameDay(cityId, 0, async () => { throw new Error("provider down"); });
    expect(failed.reactionStatus).toBe("failed"); expect(failed.after.turn).toBe(1);
    const retried = await resolveGameDay(cityId, 0, async ({ residents }) => residents.map((resident) => ({ residentId: resident.id, supportScore: 50, sentiment: "mixed", satisfaction: "mixed", reaction: "I see the changes.", mainReason: "My neighborhood has better transit access.", personalImpact: "neutral", neighborhoodImpact: "positive", financialImpact: "neutral", executionAssessment: "unknown", keyFactors: [{ factor: "neighborhood.transit_access", effect: "positive", reason: "Local access improved." }] })));
    expect(retried.after).toEqual(failed.after); expect(retried.reactionStatus).toBe("completed");
    expect((await holder.db.query("select * from simulation_snapshots where city_id=$1", [cityId])).rows).toHaveLength(2);
  }, 30000);

  it("discards invalid evidence and persists five playable fallback choices without repeating providers", async () => {
    const dependencies = providers();
    dependencies.gemini = async ({ schema }) => schema.parse({ candidates: [{ sourceSignalIds: ["bad"] }] });
    const day = await prepareGameDay(cityId, 0, dependencies);
    expect(day.status).toBe('ready');
    expect(day.slate.decisions).toHaveLength(5);
    expect(day.slate.decisions.every(c => c.executable && c.generation.model === 'authored-catalog')).toBe(true);
    expect(await prepareGameDay(cityId, 0, dependencies)).toEqual(day);
    expect(dependencies.ingest).toHaveBeenCalledTimes(1);
  }, 30000);

  it("refuses plans the city cannot afford, keeps the treasury >= 0, and allows them once funded", async () => {
    const prepared = await prepareGameDay(cityId, 0, providers());
    const candidate = prepared.slate.decisions[0]; // Expand Transit: $1.2M upfront
    await holder.db.query("update cities set treasury = 500000 where id = $1", [cityId]);

    await expect(chooseGameDayCandidate(cityId, 0, candidate.id)).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("Not enough cash"),
    });
    expect((await holder.db.query("select id from decisions where city_id = $1", [cityId])).rows).toHaveLength(0);

    // Last line of defence: the schema itself refuses an overdrawn city.
    await expect(holder.db.query("update cities set treasury = -1 where id = $1", [cityId])).rejects.toThrow(/cities_treasury_non_negative/);

    await holder.db.query("update cities set treasury = 5000000 where id = $1", [cityId]);
    await expect(chooseGameDayCandidate(cityId, 0, candidate.id)).resolves.toMatchObject({ policy_id: TRANSIT_POLICY_ID });
  }, 30000);

  it("POST /decisions refuses an unaffordable policy with 422 and accepts it once funded", async () => {
    const { POST } = await import("../../../app/api/city/[id]/decisions/route");
    const post = (policyId: string) => POST(
      new Request(`http://localhost/api/city/${cityId}/decisions`, { method: "POST", body: JSON.stringify({ policy_id: policyId }) }),
      { params: Promise.resolve({ id: cityId }) },
    );
    await holder.db.query("update cities set treasury = 500000 where id = $1", [cityId]);

    const refused = await post(TRANSIT_POLICY_ID);
    expect(refused.status).toBe(422);
    expect((await refused.json()).error).toContain("Not enough cash");
    expect((await holder.db.query("select id from decisions where city_id = $1", [cityId])).rows).toHaveLength(0);

    await holder.db.query("update cities set treasury = 5000000 where id = $1", [cityId]);
    expect((await post(TRANSIT_POLICY_ID)).status).toBe(201);
  }, 30000);

  it("interviews the people who walk the map, each answering from their own background", async () => {
    vi.stubEnv("NVIDIA_API_KEY", ""); vi.stubEnv("NEMOTRON_API_KEY", ""); // offline path: answers are built from the persona profile
    const { personaResidents } = await import("../../../lib/personas");
    const { POST } = await import("../../../app/api/city/[id]/interviews/route");
    await prepareGameDay(cityId, 0, providers()); // interviewees are reserved on the game day, so it must exist
    await holder.db.query("insert into decisions (city_id, policy_id, turn) values ($1, $2, 0)", [cityId, TRANSIT_POLICY_ID]);

    const ask = () => POST(
      new Request(`http://localhost/api/city/${cityId}/interviews`, { method: "POST", body: JSON.stringify({ turn: 0 }) }),
      { params: Promise.resolve({ id: cityId }) },
    );
    const response = await ask();
    expect(response.status).toBe(200);
    const { lines } = await response.json() as { lines: { speaker: string; text: string; label?: string; residentId?: string }[] };
    expect(lines.map(l => l.speaker)).toEqual(["news", "resident", "news", "resident"]);

    const speakers = lines.filter(l => l.speaker === "resident");
    expect(new Set(speakers.map(l => l.residentId)).size).toBe(2);
    for (const line of speakers) {
      // A real person from the map, not an anonymous household.
      const persona = personaResidents.find(p => p.id === line.residentId);
      expect(persona).toBeDefined();
      expect(line.label).toContain(persona!.name);
      const profile = [...(persona!.persona?.skills ?? []), ...(persona!.persona?.interests ?? [])].map(x => x.charAt(0).toLowerCase() + x.slice(1));
      expect(profile.some(item => line.text.includes(item)) || line.text.includes("ordinary people")).toBe(true);
    }
    // The reporter names them too.
    for (const [i, line] of lines.entries()) if (line.speaker === "news") expect(line.text).toContain(speakers[i / 2 | 0].label!.split(" · ")[0]);

    // The two people are reserved on the game day (so nobody is interviewed twice), and asking again returns the same two.
    const ids = speakers.map(l => l.residentId);
    const saved = (await holder.db.query("select generation_metadata->'interviewResidentIds' as ids from game_days where city_id = $1 and turn = 0", [cityId])).rows[0] as { ids: string[] };
    expect(saved.ids).toEqual(ids);
    const again = await (await ask()).json() as { lines: { speaker: string; residentId?: string }[] };
    expect(again.lines.filter(l => l.speaker === "resident").map(l => l.residentId)).toEqual(ids);
  }, 30000);
});
