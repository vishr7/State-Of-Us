import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toDecisionCandidate, type DecisionCandidate } from "../decisions";
import { classifyDecision, gameDayDecisionSlateSchema, selectGameDaySlate } from "../select-game-day-slate";
import { buildDailyWorld } from "../build-daily-world";
import { buildDecisions } from "../build-decisions";
import { ingestFeeds } from "../ingest-feed";
import type { ExternalSignal } from "../types";

const timestamp = "2026-09-19T12:00:00.000Z";
function signal(id: string, text: string, category: ExternalSignal["category"] = "policy"): ExternalSignal {
  return { id, documentId: `doc-${id}`, category, headline: text, summary: text,
    geography: { name: "Pittsburgh", scope: "city" }, eventDate: "2026-09-18", status: "announced",
    evidence: [{ quote: text }], source: { title: text, url: `https://${id}.example.org/article`, publisher: id, publishedAt: "2026-09-18" },
    provenance: { contentHash: id, retrievedAt: timestamp, adapterVersion: "test", extractedAt: timestamp, model: "test", promptVersion: "test" } };
}
const candidate = (id: string, text = "The city announces a pilot.", category: ExternalSignal["category"] = "policy") => toDecisionCandidate(signal(id, text, category));
const options = { day: 1, generatedAt: timestamp };
const stats = { entriesFound: 0, duplicatesSkipped: 0, processed: 0, failed: 0, feedsFailed: 0, attemptsBlocked: 0, claudeCalls: 0 };
const directories: string[] = [];
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function directory() { const dir = await mkdtemp(join(tmpdir(), "daily-world-test-")); directories.push(dir); await mkdir(join(dir, "extracted")); return dir; }
async function seed(dir: string, signals: ExternalSignal[]) {
  await writeFile(join(dir, "extracted/batch.json"), JSON.stringify({ signals }));
  await buildDecisions(dir);
}

describe("daily slate selection", () => {
  it.each([
    ["The city reports a budget deficit.", "public_finance", "major", 5, 5],
    ["Citywide transit expansion is announced.", "infrastructure", "major", 5, 5],
    ["Bridge replacement is announced.", "infrastructure", "large", 4, 4],
    ["The city announces a pilot.", "policy", "medium", 3, 3],
    ["A neighborhood cleanup initiative is announced.", "policy", "small", 2, 1],
    ["A public meeting is announced.", "policy", "minor", 1, 1],
  ] as const)("assigns deterministic scale, resources and duration: %s", (text, category, scale, resourceTier, estimatedDurationDays) => {
    expect(classifyDecision(candidate("a", text, category))).toEqual({ scale, resourceTier, estimatedDurationDays });
  });
  it("does not manufacture a scale for unknown or negated information", () => {
    expect(classifyDecision(candidate("a", "The city published a report."))).toBeNull();
    expect(classifyDecision(candidate("a", "The city is not announcing a pilot."))).toBeNull();
    const item = candidate("a", "The city announces a pilot."); item.evidence = [{ quote: "The city published a report." }];
    expect(classifyDecision(item)).toBeNull();
  });
  it("selects at most five, preferring all five available scales", () => {
    const pool = [candidate("a", "The city reports a budget deficit.", "public_finance"), candidate("b", "Bridge replacement is announced.", "infrastructure"), candidate("c"), candidate("d", "A neighborhood cleanup is announced."), candidate("e", "A public meeting is announced."), candidate("f")];
    const slate = selectGameDaySlate(pool, options);
    expect(slate.decisions).toHaveLength(5);
    expect(slate.decisions.map((option) => option.scale)).toEqual(["major", "large", "medium", "small", "minor"]);
  });
  it("prefers category diversity ahead of recency when scale is equal", () => {
    const pool = Array.from({ length: 6 }, (_, i) => candidate(`policy-${i}`));
    pool.push(candidate("housing", "The city announces a pilot.", "housing"));
    expect(selectGameDaySlate(pool, options).decisions.some((option) => option.candidate.category === "housing")).toBe(true);
  });
  it("prefers article and publisher diversity when alternatives exist", () => {
    const pool = Array.from({ length: 6 }, (_, i) => candidate(`same-${i}`));
    for (const item of pool) item.source = { ...item.source, url: "https://same.example.org/story", publisher: "Same" };
    const alternative = candidate("alternative"); alternative.source.publishedAt = "2020-01-01";
    pool.push(alternative);
    expect(selectGameDaySlate(pool, options).decisions.some((option) => option.candidate.id === alternative.id)).toBe(true);
  });
  it("prefers newer candidates, then stable candidate IDs", () => {
    const pool = Array.from({ length: 7 }, (_, i) => candidate(`id-${i}`));
    pool[0].source.publishedAt = "2020-01-01";
    pool[1].source.publishedAt = "2020-01-01";
    const result = selectGameDaySlate(pool, options);
    expect(result.decisions.every((option) => option.candidate.source.publishedAt === "2026-09-18")).toBe(true);
    const tied = Array.from({ length: 6 }, (_, i) => candidate(`tie-${i}`));
    expect(selectGameDaySlate(tied, options).decisions.map((option) => option.candidate.id).sort()).toEqual(tied.map((item) => item.id).sort().slice(0, 5));
  });
  it("excludes prior IDs, handles small pools, and never fabricates or mutates candidates", () => {
    const pool = [candidate("a"), candidate("b")]; const original = structuredClone(pool);
    const slate = selectGameDaySlate(pool, { ...options, previousIds: new Set([pool[0].id]) });
    expect(slate.decisions).toHaveLength(1);
    expect(slate.decisions[0].candidate).toEqual(pool[1]);
    expect(pool).toEqual(original);
    expect(selectGameDaySlate([], options).decisions).toEqual([]);
  });
  it("does not require events or apply type quotas", () => {
    const optional = candidate("a"); optional.type = "optional_policy";
    expect(selectGameDaySlate([optional], options).decisions[0].candidate).toEqual(optional);
  });
  it("is deterministic across input order and duplicate copies", () => {
    const pool = [candidate("a"), candidate("b"), candidate("c")];
    expect(selectGameDaySlate([...pool].reverse(), options)).toEqual(selectGameDaySlate([...pool, pool[0]], options));
  });
  it("runtime validation rejects fabricated resource metadata and conflicting IDs", () => {
    const item = candidate("a"); const slate = selectGameDaySlate([item], options);
    slate.decisions[0].resourceTier = 5;
    expect(() => gameDayDecisionSlateSchema.parse(slate)).toThrow();
    expect(() => selectGameDaySlate([item, { ...item, title: "Conflict" }], options)).toThrow("Conflicting");
  });
});

describe("daily orchestration and history", () => {
  it("invokes ingestion before building, counts new candidates, then persists selection", async () => {
    const dir = await directory(); const order: string[] = [];
    const ingest = vi.fn(async () => { order.push("ingest"); await writeFile(join(dir, "extracted/new.json"), JSON.stringify({ signals: [signal("a", "The city announces a pilot.")] })); return { ...stats, entriesFound: 1, processed: 1 }; });
    const build = vi.fn(async (path?: string) => { order.push("build"); return buildDecisions(path); });
    const result = await buildDailyWorld({ directory: dir }, { ingest, build, now: () => timestamp, log: vi.fn() });
    expect(order).toEqual(["ingest", "build"]);
    expect(result.summary).toMatchObject({ newCandidates: 1, decisionsSelected: 1, processed: 1 });
    expect(JSON.parse(await readFile(join(dir, "game-days/day-1.json"), "utf8"))).toEqual(result.slate);
  });
  it("falls back when ingestion throws or all feeds fail", async () => {
    for (const throwing of [true, false]) {
      const dir = await directory(); await seed(dir, [signal("a", "The city announces a pilot.")]);
      const log = vi.fn();
      const result = await buildDailyWorld({ directory: dir, feeds: [{ url: "https://example.org/feed" }] }, { ingest: async () => { if (throwing) throw new Error("offline"); return { ...stats, feedsFailed: 1 }; }, log });
      expect(result.slate.decisions).toHaveLength(1);
      expect(result.summary?.feedFailed).toBe(true);
      expect(log.mock.calls.some(([message]) => /failed/i.test(message))).toBe(true);
    }
  });
  it("keeps the prior candidate pool if rebuilding fails", async () => {
    const dir = await directory(); await seed(dir, [signal("a", "The city announces a pilot.")]);
    const result = await buildDailyWorld({ directory: dir }, { ingest: async () => { throw new Error("offline"); }, build: async () => { throw new Error("unavailable input"); }, log: vi.fn() });
    expect(result.slate.decisions).toHaveLength(1);
  });
  it("excludes previous-day IDs and reuses a requested existing day without ingestion", async () => {
    const dir = await directory(); await seed(dir, [signal("a", "The city announces a pilot.")]);
    const ingest = vi.fn(async () => stats); const dependencies = { ingest, log: vi.fn(), now: () => timestamp };
    const first = await buildDailyWorld({ directory: dir }, dependencies);
    const retry = await buildDailyWorld({ directory: dir, day: 1 }, dependencies);
    expect(retry.reused).toBe(true); expect(retry.slate).toEqual(first.slate);
    expect(ingest).toHaveBeenCalledTimes(1);
    // Simulate interruption after the slate write but before updating the history index.
    await unlink(join(dir, "game-days/history.json"));
    const next = await buildDailyWorld({ directory: dir }, dependencies);
    expect(next.slate.day).toBe(2); expect(next.slate.decisions).toEqual([]);
    expect(ingest).toHaveBeenCalledTimes(2);
  });
  it("uses existing article dedupe across duplicate feeds and future game days", async () => {
    const dir = await directory();
    const item = { title: "Pilot", url: "https://example.org/article", publisher: "Example", publishedAt: "2026-09-18", feedUrl: "https://example.org/feed" };
    const draft = signal("a", "The city announces a pilot.");
    const extract = vi.fn(async () => [{ category: draft.category, headline: draft.headline, summary: draft.summary, geography: draft.geography, eventDate: draft.eventDate, status: draft.status, evidence: draft.evidence }]);
    const ingestion = vi.fn(async (settings: Parameters<typeof ingestFeeds>[0]) => ingestFeeds(settings, {
      discover: async () => [item, item],
      ingest: async () => ({ id: "document", source: { ...item }, sourceType: "html", text: draft.summary, provenance: { retrievedAt: timestamp, adapterVersion: "test", contentHash: "same-content" } }),
      extract, log: vi.fn(),
    }));
    const settings = { directory: dir, feeds: [{ url: item.feedUrl }, { url: item.feedUrl }] };
    const first = await buildDailyWorld(settings, { ingest: ingestion, log: vi.fn() });
    const second = await buildDailyWorld(settings, { ingest: ingestion, log: vi.fn() });
    expect(first.summary).toMatchObject({ processed: 1, duplicatesSkipped: 3 });
    expect(second.summary).toMatchObject({ processed: 0, duplicatesSkipped: 4 });
    expect(extract).toHaveBeenCalledTimes(1);
    expect(ingestion).toHaveBeenCalledTimes(2);
  });
  it("continues after individual article failures", async () => {
    const dir = await directory(); await seed(dir, [signal("a", "The city announces a pilot.")]);
    const result = await buildDailyWorld({ directory: dir }, { ingest: async () => ({ ...stats, failed: 1, processed: 1 }), log: vi.fn() });
    expect(result.summary?.articleFailures).toBe(1); expect(result.slate.decisions).toHaveLength(1);
  });
  it("refuses overlapping daily builds", async () => {
    const dir = await directory(); await mkdir(join(dir, "game-days"));
    await writeFile(join(dir, "game-days/.build.lock"), "");
    await expect(buildDailyWorld({ directory: dir })).rejects.toThrow("locked");
  });
});
