# State of Us — Simulation Engine

Backend for the financial city simulator: a deterministic policy interpreter,
turn resolver, and the minimum API the frontend needs. Database schema lives
in [supabase/](supabase/README.md) — this README covers what was built on top
of it.

> Database and simulation engine are the source of truth. Nothing here calls
> an LLM or lets one touch canonical state — see
> [supabase/README.md "The architecture rule"](supabase/README.md#the-architecture-rule-expressed-in-the-schema).

## What's here

| Path | What |
| --- | --- |
| [src/simulation/applyPolicyEffects.ts](src/simulation/applyPolicyEffects.ts) | Pure interpreter for `policies.effects` — set/multiply/add, city/neighborhood/resident selectors |
| [src/simulation/recalculateAggregates.ts](src/simulation/recalculateAggregates.ts) | Pure recompute of derived neighborhood/city fields from residents |
| [src/simulation/loadTurnState.ts](src/simulation/loadTurnState.ts) | DB reads for one turn (city, neighborhoods, residents, decisions, policies) |
| [src/simulation/persistTurnState.ts](src/simulation/persistTurnState.ts) | DB writes for one turn |
| [src/simulation/resolveTurn.ts](src/simulation/resolveTurn.ts) | Orchestrates the above in one transaction |
| [src/simulation/errors.ts](src/simulation/errors.ts) | Typed errors (`CityNotFoundError`, etc.) |
| [src/lib/db.ts](src/lib/db.ts) | `pg` pool + transaction helper |
| [app/api/city/[id]/route.ts](app/api/city/%5Bid%5D/route.ts) | `GET /api/city/:id` |
| [app/api/city/[id]/decisions/route.ts](app/api/city/%5Bid%5D/decisions/route.ts) | `POST /api/city/:id/decisions` — queue a policy decision |
| [app/api/city/[id]/resolve-turn/route.ts](app/api/city/%5Bid%5D/resolve-turn/route.ts) | `POST /api/city/:id/resolve-turn` |
| [app/api/city/[id]/neighborhoods](app/api/city/%5Bid%5D/neighborhoods/route.ts), [/residents](app/api/city/%5Bid%5D/residents/route.ts), [app/api/policies](app/api/policies/route.ts) | Optional read-only endpoints |
| [src/lib/apiClient.ts](src/lib/apiClient.ts) | Frontend fetch wrappers: `getCity`, `getNeighborhoods`, `getResidents`, `getPolicies`, `createDecision`, `resolveTurn` |
| `src/simulation/__tests__/` | Unit tests (pure functions) + one integration test (real DB) |
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
(`src/lib/db.ts`'s `withTransaction`). If anything throws partway through,
everything rolls back; a turn is never half-resolved.

**Determinism across multiple policies in one turn:** decisions are loaded
ordered by `(created_at, id)`, and policies are applied in exactly that order.
Within a single policy, ops apply `set` → `multiply` → `add` per field (see
the comment on `applyPolicyEffects`), which is the ordering already implied by
the `PolicyEffects` contract in `src/types/database.ts`.

**Derived fields are recomputed, not policy targets.** `population`,
`average_income`, city/neighborhood `average_rent`, and `happiness` are always
rewritten from residents after effects are applied — the same convention
`supabase/seed.sql` uses. A policy's `effects` cannot set these directly: the
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
