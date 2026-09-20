# Daily world generation

```sh
npm run build:daily-world
npm run build:daily-world -- --day 1 --limit 3
```

The default day is one more than the last saved day (starting at 1). Supplying an
existing `--day` returns its exact saved slate without fetching feeds again.
Supplying a new day checks feeds once; there is no background loop or scheduler.
`--limit` caps article attempts/Claude requests, default 5, using existing ingestion
semantics. Configure verified feed URLs in `lib/signals/feeds.ts` and API credentials
in `.env.local`. Empty configuration is supported and reported explicitly.

`buildDailyWorld` in `build-daily-world.ts` calls internal functions in this order:

1. Lock the daily builder and load history/saved slates; return an existing day early.
2. Snapshot the previous candidate pool, then call `ingestFeeds` once.
3. Call `buildDecisions` to rebuild candidates from saved validated signals.
4. Select up to five previously unseen candidates with `selectGameDaySlate`.
5. Atomically save `data/signals/game-days/day-N.json`, then update `history.json`.

Ingestion still uses the general article adapter, the original signal pipeline,
extraction, evidence validation, URL/content dedupe and pre-call journal. This
layer changes none of them. Individual article failures are handled there. A
thrown ingestion error or failure of every configured feed is logged and does
not block selection from the local pool. Candidate rebuilding is still attempted;
if rebuilding fails and a previously validated pool exists, that pool is used.
If no pool exists and rebuilding fails, the command fails without saving a day.
An empty valid pool produces an empty slate, never filler.

The summary counts discovered entries, duplicate articles, processed new articles,
article failures, newly added unique candidate IDs (not every rebuilt candidate),
and selected decisions. A thrown ingestion error has unavailable counters reported
as zero plus an explicit failure log. The original ingestion summary also reports
feed failures, blocked attempts and Claude requests.

## Option metadata rules (selection version game-day-selection-v1)

These are deterministic **game-planning estimates**, not real-world budgets or
durations and not city-state effects. A rule must match both candidate title/
problem/action and original evidence. Negative/preventive sentences are ignored.
Leading “Despite …,” forecast clauses are omitted for matching reported actuals.
Original candidates and quotes are never edited.

Rules are evaluated in the following order; the first match wins:

| Scale | Rule | Resource tier | Estimated game days |
| --- | --- | --- | --- |
| major | Public finance with budget/fiscal/financial wording, deficit/restructuring/reopening/shortfall, city/county/municipal/state/national/metro wording, and no explicit local/neighborhood/block scope; OR broad-scope restructuring, overhaul, reconstruction, transit expansion, housing development, environmental remediation | 5 | 5 |
| large | Construction, replacement, renovation, expansion, capital project, substantial investment, or major program | 4 | 4 |
| medium | Pilot, upgrade, repair(s), inspection program, or training program | 3 | 3 |
| minor | Outreach, public meeting, public notice, communication campaign, information session, or awareness campaign | 1 | 1 |
| small | Explicit local/neighborhood/block/targeted wording AND cleanup, clean-up, garden, workshop, or initiative | 2 | 1 |

Broad scope means county/metro/state/national geography, or explicit citywide/
city-wide/across-the-city/throughout-the-city wording, without supported local/
neighborhood/block wording. A city geography label alone does not make an
infrastructure action citywide. Higher-order structural/fiscal rules take
precedence over incidental outreach details. Unknown scale is ineligible, rather
than assigned a tier to fill a slot. Urgency/status do not automatically increase
resource cost or duration. These narrow English rules can omit otherwise useful
candidates and can be extended in a future selection version.

## Selection and history

Each greedy pick prioritizes, in order:

1. A scale not yet represented.
2. A category not yet represented.
3. An article URL not yet represented (using existing URL normalization).
4. A publisher not yet represented (hostname fallback if publisher is absent).
5. Newer publication date, falling back to eventDate; unknown dates rank last.
6. Lexicographically smaller candidate ID, independent of locale/input order.

The final presentation is ordered by resource tier descending, then candidate ID.
There are no required events, forced choices or candidate-type quotas in this
layer. The embedded candidate's original `type` is retained unchanged for lineage
but never influences selection. More than one option of a scale/source is allowed
when alternatives run out. There is no semantic merging of separately extracted
versions of a story. Identical IDs are deduplicated; conflicting data for an ID
fails validation. The returned slate is deterministic for a fixed pool, history,
day and generatedAt; only the supplied clock timestamp varies between fresh runs.

History records all presented candidate IDs and day numbers. Previously shown IDs
are always excluded from future days; there is no repeat configuration yet. Saved
slates independently recover history if a process stops after writing its slate.
The history index survives removal of individual slate files. Missing/corrupt
historical days cannot be regenerated over an existing history entry. Keep both
history and slates to retain the no-repeat guarantee.

`game-days/.build.lock` prevents overlapping daily builders. If a process crashes,
confirm it has stopped before manually removing the stale lock. The existing feed
lock still handles feed ingestion independently. This is local filesystem storage,
not distributed locking or a database transaction. Running standalone build/feed
commands concurrently with a daily build is not a supported workflow.

Slates are runtime-validated for a positive day, at most five unique candidates,
valid metadata consistent with classification rules, timestamp, and selection
version. No frontend, database, scheduling, ongoing effects or numeric city-state
changes are included.
