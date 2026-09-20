import { mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { fetchFeed, normalizeUrl, type FeedEntry } from "./adapters/rss";
import { runSignalPipeline } from "./pipeline";
import { extractSignals } from "./extract";
import { ProcessedStore, readJson, writeJson } from "./processed";
import type { NormalizedDocument, SignalDraft } from "./types";
import { ingestArticle } from "./adapters/article";

export interface FeedOptions {
  feeds: { url: string; publisher?: string }[];
  limit?: number;
  directory?: string;
}
export interface FeedDependencies {
  ingest: (entry: FeedEntry) => Promise<NormalizedDocument>;
  extract?: (document: NormalizedDocument) => Promise<SignalDraft[]>;
  discover?: typeof fetchFeed;
  log?: (message: string) => void;
}

export async function ingestFeeds(options: FeedOptions, dependencies: FeedDependencies = { ingest: ingestArticle }) {
  const limit = options.limit ?? 5;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Limit must be a positive integer.");
  const directory = options.directory ?? join(process.cwd(), "data/signals");
  await mkdir(directory, { recursive: true });
  const lockPath = join(directory, ".ingest-feed.lock");
  const lock = await open(lockPath, "wx").catch(() => {
    throw new Error("Feed ingestion is locked. If a previous process crashed, verify it stopped before removing data/signals/.ingest-feed.lock.");
  });
  const log = dependencies.log ?? console.log;
  const summary = { entriesFound: 0, duplicatesSkipped: 0, processed: 0, failed: 0, feedsFailed: 0, attemptsBlocked: 0, claudeCalls: 0 };
  try {
    const store = new ProcessedStore(directory);
    await store.load();
    await mkdir(join(directory, "documents"), { recursive: true });
    const attemptsPath = join(directory, "attempts.json");
    // Durable pre-call journal: ambiguous/failed model calls require review, not automatic spending again.
    const attempts = z.record(z.string(), z.object({ contentHash: z.string(), attemptedAt: z.string() })).parse(await readJson(attemptsPath) ?? {});
    const entries: FeedEntry[] = [];
    for (const feed of options.feeds) {
      try { entries.push(...await (dependencies.discover ?? fetchFeed)(feed)); }
      catch { summary.feedsFailed++; log(`Feed failed: ${feed.url}`); }
    }
    summary.entriesFound = entries.length;
    entries.sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0) || a.url.localeCompare(b.url));
    const seen = new Set<string>();
    let selected = 0;
    for (const entry of entries) {
      const url = normalizeUrl(entry.url);
      if (seen.has(url) || store.has(url)) { summary.duplicatesSkipped++; continue; }
      seen.add(url);
      if (attempts[url]) { summary.attemptsBlocked++; continue; }
      if (selected >= limit) continue;
      selected++;
      try {
        const document = await dependencies.ingest(entry);
        const canonical = normalizeUrl(document.source.url);
        const prior = store.records[canonical] ?? store.byHash(document.provenance.contentHash);
        if (prior) {
          await store.mark(url, prior);
          summary.duplicatesSkipped++;
          continue;
        }
        if (attempts[canonical] || Object.values(attempts).some((attempt) => attempt.contentHash === document.provenance.contentHash)) {
          summary.attemptsBlocked++; continue;
        }
        const result = await runSignalPipeline(
          async (doc) => writeJson(join(directory, "documents", `${doc.id}.json`), { ...doc, discovery: entry }),
          {
            ingest: async () => document,
            extract: async (doc) => {
              const attempt = { contentHash: doc.provenance.contentHash, attemptedAt: new Date().toISOString() };
              attempts[url] = attempt;
              attempts[canonical] = attempt;
              await writeJson(attemptsPath, attempts);
              summary.claudeCalls++;
              return (dependencies.extract ?? extractSignals)(doc);
            },
          },
        );
        const batch = { ...result, discovery: entry, discoveredUrls: [url, canonical] };
        await writeJson(join(directory, "extracted", `${document.id}.json`), batch);
        await store.mark(url, batch);
        await store.mark(canonical, batch);
        summary.processed++;
      } catch { summary.failed++; log(`Article failed: ${url}`); }
    }
    log(`Feed entries found: ${summary.entriesFound}; duplicates skipped: ${summary.duplicatesSkipped}; successfully processed: ${summary.processed}; failed: ${summary.failed}; feeds failed: ${summary.feedsFailed}; prior attempts blocked: ${summary.attemptsBlocked}; Claude calls: ${summary.claudeCalls}.`);
    return summary;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
