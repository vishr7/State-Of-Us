import { mkdir, open, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { SIGNAL_FEEDS } from "./feeds";
import { ingestFeeds, type FeedOptions } from "./ingest-feed";
import { buildDecisions } from "./build-decisions";
import { decisionCandidateSchema, type DecisionCandidate } from "./decisions";
import { readJson, writeJson } from "./processed";
import { gameDayDecisionSlateSchema, selectGameDaySlate } from "./select-game-day-slate";

const historySchema = z.object({
  version: z.literal(1),
  days: z.array(z.number().int().positive()),
  candidateIds: z.array(z.string().min(1)),
}).strict();

async function readCandidates(directory: string): Promise<DecisionCandidate[]> {
  let files: string[];
  try { files = await readdir(join(directory, "decisions")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const candidates: DecisionCandidate[] = [];
  for (const file of files.filter((file) => file.endsWith(".json")).sort()) {
    const batch = z.object({ decisions: z.array(decisionCandidateSchema) }).parse(await readJson(join(directory, "decisions", file)));
    candidates.push(...batch.decisions);
  }
  return candidates;
}

export interface DailyWorldOptions {
  day?: number;
  directory?: string;
  feeds?: FeedOptions["feeds"];
  limit?: number;
}
export interface DailyWorldDependencies {
  ingest?: typeof ingestFeeds;
  build?: typeof buildDecisions;
  now?: () => string;
  log?: (message: string) => void;
}

export async function buildDailyWorld(options: DailyWorldOptions = {}, dependencies: DailyWorldDependencies = {}) {
  if (options.day !== undefined) z.number().int().positive().parse(options.day);
  if (options.limit !== undefined) z.number().int().positive().parse(options.limit);
  const directory = options.directory ?? join(process.cwd(), "data/signals");
  const daysDirectory = join(directory, "game-days");
  await mkdir(daysDirectory, { recursive: true });
  const lockPath = join(daysDirectory, ".build.lock");
  const lock = await open(lockPath, "wx").catch(() => { throw new Error("Daily-world build is locked. Check that the prior process stopped before removing game-days/.build.lock."); });
  const log = dependencies.log ?? console.log;
  try {
    const historyPath = join(daysDirectory, "history.json");
    const history = historySchema.parse(await readJson(historyPath) ?? { version: 1, days: [], candidateIds: [] });
    const days = new Set(history.days);
    const shown = new Set(history.candidateIds);
    // Saved slates are also a journal: recover if the process stopped before updating history.
    const saved = new Map<number, z.infer<typeof gameDayDecisionSlateSchema>>();
    for (const file of (await readdir(daysDirectory)).filter((file) => /^day-\d+\.json$/.test(file)).sort()) {
      const slate = gameDayDecisionSlateSchema.parse(await readJson(join(daysDirectory, file)));
      if (file !== `day-${slate.day}.json` || saved.has(slate.day)) throw new Error("Conflicting saved game-day files.");
      saved.set(slate.day, slate); days.add(slate.day);
      for (const option of slate.decisions) shown.add(option.candidate.id);
    }
    const lastDay = Math.max(0, ...days);
    const day = options.day ?? lastDay + 1;
    const persistHistory = () => writeJson(historyPath, { version: 1, days: [...days].sort((a, b) => a - b), candidateIds: [...shown].sort() });
    const existing = saved.get(day);
    if (existing) {
      await persistHistory();
      log(`Day ${day} already exists: returning ${existing.decisions.length} saved decisions; feeds not checked again.`);
      return { slate: existing, reused: true, summary: null };
    }
    if (day <= lastDay) throw new Error("Cannot generate an earlier or missing historical day; use the next game day.");

    const before = await readCandidates(directory);
    const beforeIds = new Set(before.map((candidate) => candidate.id));
    let feed: Awaited<ReturnType<typeof ingestFeeds>> | null = null;
    let feedFailed = false;
    const feeds = options.feeds ?? SIGNAL_FEEDS;
    if (!feeds.length) log("No feeds configured in lib/signals/feeds.ts; using the local signal/candidate pool.");
    try {
      // Invoke the existing ingestion function exactly once per newly generated day.
      feed = await (dependencies.ingest ?? ingestFeeds)({ feeds, limit: options.limit ?? 5, directory });
      feedFailed = feeds.length > 0 && feed.feedsFailed === feeds.length;
      if (feedFailed) log("All feeds failed; continuing with the existing candidate pool.");
    } catch (error) {
      feedFailed = true;
      log(`Feed ingestion failed (${error instanceof Error ? error.name : "unknown error"}); continuing with the existing candidate pool. Check feed access and local ingestion state.`);
    }
    let pool = before;
    try {
      await (dependencies.build ?? buildDecisions)(directory);
      pool = await readCandidates(directory);
    } catch (error) {
      if (!before.length) throw error;
      log("Candidate rebuild failed; using the previously validated candidate pool.");
    }
    const newCandidates = new Set(pool.filter((candidate) => !beforeIds.has(candidate.id)).map((candidate) => candidate.id)).size;
    const slate = selectGameDaySlate(pool, { day, previousIds: shown, generatedAt: (dependencies.now ?? (() => new Date().toISOString()))() });
    // Output first, index second: a retry can reconstruct the index without presenting IDs again.
    await writeJson(join(daysDirectory, `day-${day}.json`), slate);
    days.add(day); for (const option of slate.decisions) shown.add(option.candidate.id);
    await persistHistory();
    const summary = {
      entriesFound: feed?.entriesFound ?? 0, duplicatesSkipped: feed?.duplicatesSkipped ?? 0,
      processed: feed?.processed ?? 0, articleFailures: feed?.failed ?? 0,
      feedFailed, newCandidates, decisionsSelected: slate.decisions.length,
    };
    log(`Day ${day}: feed entries discovered ${summary.entriesFound}; duplicate articles skipped ${summary.duplicatesSkipped}; new articles processed ${summary.processed}; article failures ${summary.articleFailures}; new candidates ${newCandidates}; decisions selected ${slate.decisions.length}.`);
    return { slate, reused: false, summary };
  } finally { await lock.close(); await unlink(lockPath); }
}
