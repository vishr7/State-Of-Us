import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFeed, normalizeUrl, type FeedEntry } from "../adapters/rss";
import { ingestFeeds } from "../ingest-feed";
import { ProcessedStore } from "../processed";
import type { NormalizedDocument } from "../types";

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
async function directory() { const dir = await mkdtemp(join(tmpdir(), "signals-test-")); directories.push(dir); return dir; }
const entry = (name: string, publishedAt: string | null = null): FeedEntry => ({ title: name, url: `https://example.org/${name}`, publishedAt, publisher: "News", feedUrl: "https://example.org/feed" });
const document = (item: FeedEntry): NormalizedDocument => ({
  id: item.title, source: { ...item, publisher: "News" }, sourceType: "html", text: "Grounded article text.",
  provenance: { contentHash: item.title, adapterVersion: "test", retrievedAt: "2026-01-01T00:00:00Z" },
});
const feeds = [{ url: "https://example.org/feed" }];

describe("feed discovery", () => {
  it("parses RSS, entities, dates, relative links and source", () => {
    const result = parseFeed('<rss><channel><title>City News</title><item><title>A &amp; B</title><link>/article?utm_source=rss</link><pubDate>Fri, 18 Sep 2026 12:00:00 GMT</pubDate></item><item><link>javascript:bad</link></item></channel></rss>', feeds[0].url);
    expect(result).toEqual([{ title: "A & B", url: "https://example.org/article", publishedAt: "2026-09-18T12:00:00.000Z", publisher: "City News", feedUrl: feeds[0].url }]);
  });
  it("parses Atom alternate links, CDATA and updated fallback", () => {
    const result = parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><title>News</title><entry><title><![CDATA[A story]]></title><link rel="self" href="/api/1"/><link rel="alternate" href="/story"/><updated>2026-09-18T12:00:00Z</updated></entry></feed>', feeds[0].url);
    expect(result[0]).toMatchObject({ title: "A story", url: "https://example.org/story", publishedAt: "2026-09-18T12:00:00.000Z", publisher: "News" });
  });
  it("handles absent or invalid dates and rejects non-feeds", () => {
    expect(parseFeed('<rss><channel><item><link>https://example.org/a</link><pubDate>bad</pubDate></item></channel></rss>', feeds[0].url)[0].publishedAt).toBeNull();
    expect(() => parseFeed("<html>Error</html>", feeds[0].url)).toThrow("Unsupported feed");
  });
  it("dedupes URL spellings while preserving meaningful differences", () => {
    expect(normalizeUrl("https://EXAMPLE.org:443/a?b=2&utm_source=x&a=1#part")).toBe("https://example.org/a?a=1&b=2");
    expect(normalizeUrl("https://example.org/a?id=1")).not.toBe(normalizeUrl("https://example.org/a?id=2"));
  });
});

describe("feed ingestion", () => {
  it("continues after an article fails, marks only success, and persists across runs", async () => {
    const dir = await directory();
    const extract = vi.fn(async () => []);
    const dependencies = { discover: async () => [entry("bad"), entry("good")], ingest: async (item: FeedEntry) => { if (item.title === "bad") throw new Error("fetch failed"); return document(item); }, extract, log: vi.fn() };
    expect(await ingestFeeds({ feeds, directory: dir }, dependencies)).toMatchObject({ processed: 1, failed: 1 });
    const store = new ProcessedStore(dir); await store.load();
    expect(store.has(entry("good").url)).toBe(true);
    expect(store.has(entry("bad").url)).toBe(false);
    expect(await ingestFeeds({ feeds, directory: dir }, dependencies)).toMatchObject({ duplicatesSkipped: 1, failed: 1 });
    expect(extract).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(join(dir, "extracted/good.json"), "utf8"))).toMatchObject({ source: { url: entry("good").url }, provenance: { contentHash: "good", model: expect.any(String), promptVersion: expect.any(String) }, discovery: entry("good") });
  });
  it("sorts newest first, dedupes within a run, and caps attempts", async () => {
    const extract = vi.fn(async () => []);
    const ingest = vi.fn(async (item: FeedEntry) => document(item));
    const result = await ingestFeeds({ feeds, directory: await directory(), limit: 1 }, { discover: async () => [entry("old", "2025-01-01"), entry("new", "2026-01-01"), entry("new", "2026-01-01")], ingest, extract, log: vi.fn() });
    expect(result).toMatchObject({ entriesFound: 3, processed: 1, duplicatesSkipped: 1, claudeCalls: 1 });
    expect(ingest.mock.calls[0][0].title).toBe("new");
    expect(extract).toHaveBeenCalledTimes(1);
  });
  it("recovers the index from saved outputs and dedupes matching content", async () => {
    const dir = await directory();
    const extract = vi.fn(async () => []);
    await ingestFeeds({ feeds, directory: dir }, { discover: async () => [entry("a")], ingest: async (item) => document(item), extract, log: vi.fn() });
    await unlink(join(dir, "processed.json"));
    const result = await ingestFeeds({ feeds, directory: dir }, { discover: async () => [entry("a"), entry("alias")], ingest: async (item) => ({ ...document(item), provenance: document(entry("a")).provenance }), extract, log: vi.fn() });
    expect(result.duplicatesSkipped).toBe(2);
    expect(extract).toHaveBeenCalledTimes(1);
  });
  it("does not retry failed Claude calls automatically or mark them successful", async () => {
    const dir = await directory();
    const extract = vi.fn(async () => { throw new Error("ambiguous timeout"); });
    const dependencies = { discover: async () => [entry("a")], ingest: async (item: FeedEntry) => document(item), extract, log: vi.fn() };
    expect(await ingestFeeds({ feeds, directory: dir }, dependencies)).toMatchObject({ failed: 1, processed: 0 });
    expect(await ingestFeeds({ feeds, directory: dir }, dependencies)).toMatchObject({ attemptsBlocked: 1 });
    const store = new ProcessedStore(dir); await store.load(); expect(store.has(entry("a").url)).toBe(false);
    expect(extract).toHaveBeenCalledTimes(1);
  });
  it("continues after a feed fails", async () => {
    const result = await ingestFeeds({ feeds: [...feeds, { url: "https://example.org/other" }], directory: await directory() }, { discover: async (feed) => { if (feed.url === feeds[0].url) throw new Error("offline"); return [entry("a")]; }, ingest: async (item) => document(item), extract: async () => [], log: vi.fn() });
    expect(result).toMatchObject({ feedsFailed: 1, processed: 1 });
  });
  it("rejects overlapping runs before a second Claude call", async () => {
    const dir = await directory();
    let release!: () => void;
    let started!: () => void;
    const running = new Promise<void>((resolve) => { started = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const dependencies = { discover: async () => { started(); await hold; return []; }, ingest: async (item: FeedEntry) => document(item), log: vi.fn() };
    const first = ingestFeeds({ feeds, directory: dir }, dependencies);
    await running;
    try { await expect(ingestFeeds({ feeds, directory: dir }, dependencies)).rejects.toThrow("locked"); }
    finally { release(); await first; }
  });
  it("imports nonempty saved batches without extracting them again", async () => {
    const dir = await directory();
    const extract = vi.fn(async () => [{ category: "policy" as const, headline: "Grounded", summary: "Grounded", geography: { name: "Pittsburgh", scope: "city" as const }, eventDate: null, status: "announced" as const, evidence: [{ quote: "Grounded article text." }] }]);
    const dependencies = { discover: async () => [entry("a")], ingest: async (item: FeedEntry) => document(item), extract, log: vi.fn() };
    expect(await ingestFeeds({ feeds, directory: dir }, dependencies)).toMatchObject({ processed: 1 });
    await unlink(join(dir, "processed.json"));
    expect(await ingestFeeds({ feeds, directory: dir }, dependencies)).toMatchObject({ duplicatesSkipped: 1, claudeCalls: 0 });
  });
  it("retains evidence validation", async () => {
    const result = await ingestFeeds({ feeds, directory: await directory() }, { discover: async () => [entry("a")], ingest: async (item) => document(item), extract: async () => [{ category: "policy", headline: "Unsupported", summary: "Unsupported", geography: { name: "Pittsburgh", scope: "city" }, eventDate: null, status: "announced", evidence: [{ quote: "Invented quotation" }] }], log: vi.fn() });
    expect(result).toMatchObject({ processed: 0, failed: 1 });
  });
});
