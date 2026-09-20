# Feed ingestion

Add verified public RSS/Atom feed URLs to `SIGNAL_FEEDS` in `lib/signals/feeds.ts`:

```ts
{ url: "YOUR_VERIFIED_PUBLIC_FEED_URL", publisher: "Publisher name" }
```

No reliable feed URL was already present in the repository, so the configuration
starts empty with a marked placeholder. No discovery uses an LLM.

With `ANTHROPIC_API_KEY` in `.env.local`, run from the repository root:

```sh
npm run ingest:feed
npm run ingest:feed -- --limit 3
npm run ingest:feed -- --feed https://YOUR_HOST/YOUR_FEED --limit 3
```

Repeat `--feed` to supply multiple feeds; CLI feeds replace the configured list.
The default limit is 5 new article attempts, hence at most 5 Claude requests
(the existing extractor disables retries). Fetch failures also consume the limit.
Entries currently available in feeds are sorted newest first; undated entries come
last. There is no historical backfill, fixed date cutoff, or scheduler.

`ingest:feed` uses `ingestArticle` in `lib/signals/adapters/article.ts`, then
`runSignalPipeline`, `extractSignals`, and the unchanged evidence validation.
It saves documents under `documents/` and validated batches under `extracted/`,
including empty batches. Discovery metadata is retained alongside the original
source and provenance fields. It does not insert results into the database.
`ingest:signal` continues using the original hard-coded press-release adapter and
its existing database persistence behavior.

The general adapter prefers articleBody/article/main containers, known article
body classes, and Article JSON-LD metadata. Only a full JSON-LD articleBody can
substitute for a missing container. It removes obvious chrome, preserves paragraph
breaks and Unicode, and rejects ambiguous, link-heavy, short (<300 characters or
50 whitespace-delimited words), or oversized (>40,000 characters) text. Unknown
publisher is an empty string to retain the existing source type; unknown date is
null. It cannot render JavaScript or bypass paywalls, and site-specific markup can
require future adapters. The unchanged extraction prompt contains a historical
March 2026 reference inherited from the manual use case.

## Deduplication and recovery

`processed.json` records success only after validated output is saved. URL
normalization removes fragments and known tracking parameters, normalizes the
host/default port and sorts query parameters; meaningful query/path differences
remain. The adapter's canonical URL and existing content hashes provide additional
deduplication before Claude is called. Saved extraction batches seed/recover the
index, including earlier manual JSON outputs. Database-only manual runs are not
discoverable from this local index. Keep all state and output files across runs.

`attempts.json` journals URLs/content hashes **before** calling Claude. If a model
call fails or the process stops before saving its output, that attempt remains
blocked rather than risking another paid request. It is not marked processed.
Failures before a model call may retry on the next run. To explicitly retry a
blocked attempt, first inspect saved outputs and the failure, then remove its
matching URL/alias records from `attempts.json`. This explicitly forfeits the
no-repeat guarantee for that attempt. Successful outputs still take precedence.

`.ingest-feed.lock` prevents concurrent feed runs sharing this directory. After a
crash, confirm the previous process has stopped before deleting a stale lock.
Corrupt saved JSON fails closed rather than silently resetting deduplication.
This is local filesystem coordination, not a distributed or transactional store.
The unchanged manual command does not participate in the feed lock/journal.

The summary reports entries found, duplicates, successes, article/feed failures,
blocked prior attempts, and Claude calls. Errors do not stop other articles/feeds;
the CLI exits nonzero if failures or blocked attempts need attention.

### Connected Pittsburgh sources

The default collector now includes PublicSource RSS, WESA Politics & Government RSS,
the official Engage Pittsburgh housing-needs project and Engage PRT bus redesign.
Official project pages have no invented publication date. Each source gets a turn
in the collection batch, and articles within each feed are processed newest first.

Run `npm run ingest:feed -- --limit 4` from the project directory to collect and
extract sources using GEMINI_API_KEY in .env (or .env.local).
This is a manual refresh command, not an installed scheduler. Game-day preparation
loads cached extracted evidence without fetching articles or running extraction.
Newly collected evidence affects future prepared days; saved choices remain intact.

Failed extraction attempts are journaled in attempts.json to avoid automatic
repeated API calls. After confirming an authentication failure and fixing the key,
remove only the corresponding failed URLs from that journal before retrying.
