# State of Us

Minimal Next.js + TypeScript API-only backend for retrieving Pittsburgh population and median household income from the U.S. Census Bureau.

## Run locally

Install Node.js 22 LTS or a newer supported LTS release (including npm), then run from this directory:

```sh
npm install
npm run dev
```

The first install generates `package-lock.json`; commit it to share dependency versions with the team.

Open http://localhost:3000/api/city-data or check it in PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/api/city-data | ConvertTo-Json -Depth 5
```

## Endpoint and data source

`GET /api/city-data` always retrieves Pittsburgh city, Pennsylvania (state FIPS `42`, place FIPS `61000`). No parameters are required.

On success, HTTP 200 JSON contains:

- `city`: the Census geographic name.
- `population`: a numeric population estimate in people (`B01003_001E`).
- `medianHouseholdIncome`: a numeric income estimate in 2024 inflation-adjusted U.S. dollars (`B19013_001E`).
- `source`: the Census Bureau name, dataset, year, observation period, request URL, geographic identifiers, variable codes, and units.

Both metrics come from the **2024 American Community Survey (ACS) 5-Year Estimates**, covering **2020–2024**. These are survey estimates for the city proper, not the Pittsburgh metro area or live counts.

[Census dataset documentation](https://www.census.gov/data/developers/data-sets/acs-5year.html)

[Direct Census API request](https://api.census.gov/data/2024/acs/acs5?get=NAME,B01003_001E,B19013_001E&for=place:61000&in=state:42)

Each request fetches real Census data without caching and has a 10-second upstream timeout. Network failures, non-success Census responses, malformed data, and missing or suppressed estimates return HTTP 502:

```json
{"error":"Unable to retrieve city data from the Census API. Please try again later."}
```

No mock values are substituted on failure. Error details are logged on the server.

## Project structure

- `app/api/city-data/route.ts`: HTTP response and error handling.
- `lib/data/census.ts`: Census request, response validation, numeric conversion, and source metadata.
- `package.json`, `tsconfig.json`, and `next-env.d.ts`: Next.js and TypeScript setup.

There is no frontend or homepage; `/` returns 404. The placeholder `/api/health` route has been removed.
The Census request uses public access without an API key; no environment variables are required for this initial version. Internet access to `api.census.gov` is required.

## Production build

```sh
npm run build
npm start
```

Dependencies have not been installed and the application has not been run in the authoring environment because Node.js/npm are unavailable. Run the commands above locally to verify the build and endpoint.

---

# State of Us — Simulation Engine

Backend for the financial city simulator: a deterministic policy interpreter,
turn resolver, and the minimum API the frontend needs. Database schema lives
in [database/supabase/](database/supabase/README.md) — this README covers what was built on top
of it.

> Database and simulation engine are the source of truth. Nothing here calls
> an LLM or lets one touch canonical state — see
> [database/supabase/README.md "The architecture rule"](database/supabase/README.md#the-architecture-rule-expressed-in-the-schema).

## What's here

| Path | What |
| --- | --- |
| [database/simulation/applyPolicyEffects.ts](database/simulation/applyPolicyEffects.ts) | Pure interpreter for `policies.effects` — set/multiply/add, city/neighborhood/resident selectors |
| [database/simulation/recalculateAggregates.ts](database/simulation/recalculateAggregates.ts) | Pure recompute of derived neighborhood/city fields from residents |
| [database/simulation/loadTurnState.ts](database/simulation/loadTurnState.ts) | DB reads for one turn (city, neighborhoods, residents, decisions, policies) |
| [database/simulation/persistTurnState.ts](database/simulation/persistTurnState.ts) | DB writes for one turn |
| [database/simulation/resolveTurn.ts](database/simulation/resolveTurn.ts) | Orchestrates the above in one transaction |
| [database/simulation/errors.ts](database/simulation/errors.ts) | Typed errors (`CityNotFoundError`, etc.) |
| [database/lib/db.ts](database/lib/db.ts) | `pg` pool + transaction helper |
| [app/api/city/[id]/route.ts](app/api/city/%5Bid%5D/route.ts) | `GET /api/city/:id` |
| [app/api/city/[id]/decisions/route.ts](app/api/city/%5Bid%5D/decisions/route.ts) | `POST /api/city/:id/decisions` — queue a policy decision |
| [app/api/city/[id]/resolve-turn/route.ts](app/api/city/%5Bid%5D/resolve-turn/route.ts) | `POST /api/city/:id/resolve-turn` |
| [app/api/city/[id]/neighborhoods](app/api/city/%5Bid%5D/neighborhoods/route.ts), [/residents](app/api/city/%5Bid%5D/residents/route.ts), [app/api/policies](app/api/policies/route.ts) | Optional read-only endpoints |
| [src/lib/apiClient.ts](src/lib/apiClient.ts) | Frontend fetch wrappers: `getCity`, `getNeighborhoods`, `getResidents`, `getPolicies`, `createDecision`, `resolveTurn` |
| `database/simulation/__tests__/` | Unit tests (pure functions) + one integration test (real DB) |
| `src/lib/__tests__/apiClient.test.ts` | Unit tests for the client, with `fetch` mocked |

No UI was added — `app/` exists only to host the API route handlers.

## The turn resolution flow

```
snapshot N
  → load decisions recorded at turn N, and the policies they reference
  → apply each policy's effects, in memory, in a fixed deterministic order
  → recompute neighborhood aggregates from residents
  → recompute city aggregates from residents
  → persist residents, neighborhoods, city
  → write snapshot N+1 (the resulting canonical state)
  → set cities.current_turn = N+1
```

All of it — every read and write — happens inside one Postgres transaction
(`database/lib/db.ts`'s `withTransaction`). If anything throws partway through,
everything rolls back; a turn is never half-resolved.

**Determinism across multiple policies in one turn:** decisions are loaded
ordered by `(created_at, id)`, and policies are applied in exactly that order.
Within a single policy, ops apply `set` → `multiply` → `add` per field (see
the comment on `applyPolicyEffects`), which is the ordering already implied by
the `PolicyEffects` contract in `database/types/database.ts`.

**Derived fields are recomputed, not policy targets.** `population`,
`average_income`, city/neighborhood `average_rent`, and `happiness` are always
rewritten from residents after effects are applied — the same convention
`database/supabase/seed.sql` uses. A policy's `effects` cannot set these directly: the
interpreter validates every target field against the exact `CityEffectTarget`
/ `NeighborhoodEffectTarget` / `ResidentEffectTarget` unions and throws
`MalformedPolicyEffectsError` on anything else (including a hypothetical
`{"population": {...}}`).

## Running it

```bash
npm install
cp .env.example .env.local   # point DATABASE_URL at a migrated + seeded Postgres
npm run dev                  # http://localhost:3000
```

`DATABASE_URL` must be a **direct Postgres connection**, not the Supabase
PostgREST URL — the engine needs a real multi-statement transaction. See
`.env.example`.

## Tests

```bash
npm test                # unit tests only (no database needed)
npm run test:integration  # requires DATABASE_URL against a migrated+seeded DB
```

The integration test (`resolveTurn.integration.test.ts`) runs the seeded
Marrow Bay city through a real turn: it adds one extra decision for
**Crosstown Bus Rapid Transit** (a transit-category policy, as asked) next to
the seed's own turn-0 decision, calls `resolveTurn`, then asserts against the
database that:

- `current_turn` advanced and a `simulation_snapshots` row exists for the new turn
- treasury/revenue are unchanged (BRT's effects have no `city` block — verifies the *conditional*, not just the changed case)
- neighborhoods below the transit threshold gained exactly the effect's `+18`
- residents under the income threshold got `commute_minutes * 0.82`, rounded
- neighborhood population/aggregates match a fresh calculation over the persisted residents
- city happiness matches an independent recomputation from all residents

A second assertion resolves another turn with zero queued decisions and
confirms it still advances and snapshots cleanly.

> ⚠️ This test is **not idempotent against a shared database**: it really
> calls `resolveTurn()` twice, advancing Marrow Bay's `current_turn` for real
> (there's no "undo" — turn resolution is a one-way ledger by design). It only
> cleans up the one `decisions` row it inserts. Point `DATABASE_URL` at a
> disposable/scratch database for this, not your shared dev database, unless
> you're fine with its turn counter moving.

I ran the full suite — unit tests, the apiClient tests, and this integration
test — against a real PostgreSQL 18 instance (migration + seed applied fresh)
before writing this up: 20 tests, all green. I then started `next dev` and
exercised every endpoint below by hand with `curl`, including the decision
endpoint's validation, 404s, and duplicate-rejection paths, and the full
fetch → decide → resolve → fetch flow end to end.

## Submitting a decision

`POST /api/city/:id/decisions` queues a policy against the city's **current**
(not-yet-resolved) turn — it only inserts the row. Nothing about canonical
state changes until `resolve-turn` is called; this route never touches the
simulation engine.

```
Body:  { "policy_id": string, "player_reasoning"?: string }
200:   never used by this route
201:   the created decision row
400:   missing/invalid policy_id, or invalid JSON
404:   city or policy not found
409:   this exact (city, turn, policy) combination was already decided
       (decisions_city_turn_policy_key)
```

## Example requests

```bash
CITY=11111111-1111-4111-8111-111111111111
POLICY=33333333-3333-4333-8333-000000000004  # Rental Assistance Program

# 1. Current state
curl http://localhost:3000/api/city/$CITY
# {"id":"...","name":"Marrow Bay","current_turn":0,"population":226,
#  "treasury":1240000,"revenue":1690000,"expenses":1604000,"debt":4350000,
#  "happiness":56.38,"approval":53.4,"unemployment":11.49,"average_rent":2269.01}

# 2. See what's available
curl http://localhost:3000/api/policies

# 3. Queue a decision for the current turn
curl -X POST http://localhost:3000/api/city/$CITY/decisions \
  -H "Content-Type: application/json" \
  -d "{\"policy_id\":\"$POLICY\",\"player_reasoning\":\"Renters are past 60% rent burden.\"}"
# 201 {"id":"...","city_id":"...","policy_id":"...","turn":0,
#      "player_reasoning":"Renters are past 60% rent burden.","created_at":"..."}

# 4. Resolve the turn — applies every decision queued for it
curl -X POST http://localhost:3000/api/city/$CITY/resolve-turn
# {"city":{...updated...},"previous_turn":0,"turn":1,
#  "applied_decisions":[{"decision_id":"...","policy_id":"...","policy_name":"Rental Assistance Program"}]}

# 5. Confirm it stuck
curl http://localhost:3000/api/city/$CITY
# current_turn: 1, average_rent lower than step 1's — the policy's effect persisted

# Unknown city
curl -i http://localhost:3000/api/city/00000000-0000-0000-0000-000000000000
# HTTP/1.1 404
# {"error":"City 00000000-0000-0000-0000-000000000000 not found"}

# Duplicate decision (submit step 3 again for the same turn)
# HTTP/1.1 409
# {"error":"A decision for policy ... already exists for city ... at turn 0"}
```

From the frontend, the same flow reads as:

```ts
import { getCity, getPolicies, createDecision, resolveTurn } from '@/lib/apiClient';

const city = await getCity(cityId);
const policies = await getPolicies();
await createDecision(cityId, policies[0].id, 'Renters are past 60% rent burden.');
const { city: updated, applied_decisions } = await resolveTurn(cityId);
```

Status codes overall: `200`/`201` success, `400` bad request body, `404` city
or policy not found, `409` conflict (duplicate decision, or the turn's
snapshot already exists), `500` unexpected or data-integrity errors (missing
policy referenced by a decision, malformed effects, unsupported effects
version) — logged server-side with the descriptive error, since these
indicate corrupted catalogue data rather than a bad request.

## Known limitations

- **`policies.upfront_cost` / `recurring_cost` are not auto-debited.** Only
  explicit `effects.city` ops move `treasury`/`revenue`/`expenses`/`debt`
  today. Wiring the cost columns into `resolveTurn` (charge `upfront_cost`
  once, accrue `recurring_cost` into `expenses` every turn a policy stays
  active) is a natural next step, but wasn't part of the specified flow and
  would need a decision on how "active" is tracked across turns.
- **`ramp_turns` in `PolicyEffects` is not interpreted.** Effects apply at
  full magnitude in the turn the decision resolves, even though some seeded
  policies specify a ramp. Phasing effects in over turns wasn't in scope here.
- **A city-level `happiness`/`approval`/`unemployment` policy effect is
  transient.** Because city aggregates are unconditionally recomputed from
  residents *after* effects are applied (by design — see "Derived fields"
  above), a policy that sets `city.unemployment` directly (the seeded "Small
  Business Grant Fund" does) gets overwritten by the recompute in the same
  turn. Only resident- and neighborhood-level effects durably move these
  aggregates right now. Flagging this rather than quietly special-casing it,
  since fixing it means either changing the specified step order or adding a
  reconciliation rule that isn't in the current contract.
- **No clamping to CHECK-constraint ranges.** If a policy's `add`/`multiply`
  pushes a field outside its valid range (e.g. `transit_access` past 100), the
  transaction fails with a Postgres constraint-violation error and rolls back
  — intentional (the database enforces valid ranges), but worth knowing before
  authoring new policies.
- **Per-row UPDATEs, not bulk.** `persistTurnState.ts` issues one `UPDATE` per
  resident/neighborhood inside the transaction. Fine at seed scale (100
  residents); switch to a bulk `UPDATE ... FROM unnest(...)` if that grows.
- **Next.js pinned to 14.2.x.** It's the latest 14.2 patch, but several recent
  Next.js CVEs are fixed only in 15.x/16.x. This app is API-route-only (no
  `next/image`, middleware, i18n rewrites, or Server Actions), which avoids
  most of those vectors, but an upgrade is worth doing before this is
  internet-facing — skipped here since Next 15 changes the route-handler
  `params` signature (becomes a `Promise`), a wider change than this task's scope.
- **No auth/rate limiting on the API routes** — fine for local hackathon use,
  not for a deployed target.

---

# Census data API

Next.js + TypeScript Census endpoint for retrieving Pittsburgh population and median household income from the U.S. Census Bureau.

## Run locally

Install Node.js 22 LTS or a newer supported LTS release (including npm), then run from this directory:

```sh
npm install
npm run dev
```

The first install generates `package-lock.json`; commit it to share dependency versions with the team.

Open http://localhost:3000/api/city-data or check it in PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/api/city-data | ConvertTo-Json -Depth 5
```

## Endpoint and data source

`GET /api/city-data` always retrieves Pittsburgh city, Pennsylvania (state FIPS `42`, place FIPS `61000`). No parameters are required.

On success, HTTP 200 JSON contains:

- `city`: the Census geographic name.
- `population`: a numeric population estimate in people (`B01003_001E`).
- `medianHouseholdIncome`: a numeric income estimate in 2024 inflation-adjusted U.S. dollars (`B19013_001E`).
- `source`: the Census Bureau name, dataset, year, observation period, request URL, geographic identifiers, variable codes, and units.

Both metrics come from the **2024 American Community Survey (ACS) 5-Year Estimates**, covering **2020–2024**. These are survey estimates for the city proper, not the Pittsburgh metro area or live counts.

[Census dataset documentation](https://www.census.gov/data/developers/data-sets/acs-5year.html)

[Direct Census API request](https://api.census.gov/data/2024/acs/acs5?get=NAME,B01003_001E,B19013_001E&for=place:61000&in=state:42)

Each request fetches real Census data without caching and has a 10-second upstream timeout. Network failures, non-success Census responses, malformed data, and missing or suppressed estimates return HTTP 502:

```json
{"error":"Unable to retrieve city data from the Census API. Please try again later."}
```

No mock values are substituted on failure. Error details are logged on the server.

## Project structure

- `app/api/city-data/route.ts`: HTTP response and error handling.
- `lib/data/census.ts`: Census request, response validation, numeric conversion, and source metadata.
- `package.json`, `tsconfig.json`, and `next-env.d.ts`: Next.js and TypeScript setup.

The Census request uses public access without an API key; no environment variables are required for this initial version. Internet access to `api.census.gov` is required.

## Production build

```sh
npm run build
npm start
```

Run the commands above locally to verify the build and endpoint.
