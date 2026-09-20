import { parseArgs } from "node:util";
import { SIGNAL_FEEDS } from "../lib/signals/feeds";
import { ingestFeeds } from "../lib/signals/ingest-feed";

async function main() {
  const { values } = parseArgs({ options: {
    limit: { type: "string", default: "5" },
    feed: { type: "string", multiple: true },
  } });
  const limit = Number(values.limit);
  if (!/^\d+$/.test(values.limit!) || !Number.isSafeInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer.");
  const feeds = values.feed?.length ? values.feed.map((url) => ({ url })) : SIGNAL_FEEDS;
  if (!feeds.length) {
    console.log("No feeds configured. Add verified public feed URLs to lib/signals/feeds.ts or pass --feed URL. No Gemini calls made.");
    return;
  }
  if (!process.env.GEMINI_API_KEY?.trim()) throw new Error("Missing GEMINI_API_KEY. Add it to .env.local.");
  const summary = await ingestFeeds({ feeds, limit });
  if (summary.failed || summary.feedsFailed || summary.attemptsBlocked) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("Feed ingestion failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
