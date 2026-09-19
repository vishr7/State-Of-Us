# State of Us — Database Integration (Overview)

Single entry point for everything database-related in this project: schema,
seed data, the deterministic simulation engine that reads/writes it, and the
API surface the frontend calls. This folder doesn't hold code — the actual
files live where noted below; this is the map plus the reasoning that doesn't
live in any one file.

Deeper docs, if you need more than what's here:
- [supabase/README.md](supabase/README.md) — the schema in full detail (every column, every index, every convention)
- [../README.md](../README.md) — the simulation engine + API in full detail (every route, every test, every known limitation)

Everything in this document is also true as of the last verification pass:
migration + seed applied clean to a real PostgreSQL 18 instance, the full test
suite (20 tests) green, and every API route exercised live with `curl`.

---

## 1. The rule everything here follows

> The database and the deterministic simulation engine are the source of
> truth. LLMs may generate reasoning and reactions but must never directly
> determine or mutate canonical game state.

Concretely, in this codebase:

1. **Exactly one LLM-writable column exists**: `decisions.player_reasoning`,
   free text. Nothing reads it back into the simulation. Deleting every byte
   of it must leave the simulation bit-for-bit reproducible — that's the test
   for whether a new feature has violated this rule.
2. **Row Level Security makes it a permission, not a convention.** Every
   table is publicly readable and has no write policy. The browser can read
   everything and write nothing; only a server process with a direct Postgres
   connection (bypassing RLS, the equivalent of Supabase's `service_role`)
   can mutate state.
3. **Policy effects are data, not prose.** `policies.effects` is a versioned
   JSONB contract the engine executes arithmetically — an LLM can describe
   what a policy did, never decide what it does.

## 2. Where the pieces live

| Layer | Location | What |
| --- | --- | --- |
| Schema | [supabase/migrations/20260919120000_initial_schema.sql](supabase/migrations/20260919120000_initial_schema.sql) | 3 enums, 6 tables, FKs, indexes, RLS |
| Seed data | [supabase/seed.sql](supabase/seed.sql) | 1 city, 4 neighborhoods, 100 households, 6 policies, 1 decision, turn-0 snapshot — fully deterministic |
| TypeScript types | [types/database.ts](types/database.ts) | Row/Insert/Update types, `Database` type for `createClient<Database>()`, the two JSONB contracts (`PolicyEffects`, `SimulationState`) |
| DB connection | [lib/db.ts](lib/db.ts) | Direct `pg` pool + transaction helper (not PostgREST — see §5) |
| Simulation engine | [simulation/](simulation/) | Pure policy interpreter + aggregate recomputation + transactional turn resolver |
| API routes | [../app/api/](../app/api/) | The only way the frontend touches the database |
| Frontend client | [../src/lib/apiClient.ts](../src/lib/apiClient.ts) | Typed `fetch` wrappers around the API routes |

## 3. Schema shape

```
cities ──1:N──> neighborhoods ──1:N──> residents
   │
   ├──1:N──> decisions ──N:1──> policies      (global catalogue)
   └──1:N──> simulation_snapshots             (unique per turn)
```

`neighborhoods`, `residents`, `decisions`, `simulation_snapshots` all cascade
from their city. `decisions.policy_id` is `ON DELETE RESTRICT` — a city's
decision history must survive catalogue edits; retire a policy, don't delete
it.

**One `residents` row is one household**, not one person — `family_size` is
how many people it represents, so `population = sum(family_size)`, never
`count(*)`. The seed's 100 rows represent 226 people.

Full column list, units (money/annual-vs-monthly/0-100 indices/0-1 weights),
enums, and the two JSONB contracts (`policies.effects`, and
`simulation_snapshots.state`) are documented in
[supabase/README.md](supabase/README.md) — not repeated here to avoid the
two docs drifting out of sync.

## 4. How a turn resolves

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

All of it runs inside one Postgres transaction
([lib/db.ts](lib/db.ts)'s `withTransaction`) — if anything throws,
everything rolls back, so a turn is never half-resolved.

- **Determinism across multiple policies in one turn**: decisions load
  ordered by `(created_at, id)` and apply in exactly that order. Within one
  policy, ops apply `set` → `multiply` → `add` per field.
- **Derived fields are recomputed, never policy targets.** `population`,
  `average_income`, `average_rent`, and `happiness` are always rewritten from
  residents after effects apply. The interpreter
  ([simulation/applyPolicyEffects.ts](simulation/applyPolicyEffects.ts))
  validates every effect target at runtime against the exact field lists
  `CityEffectTarget` / `NeighborhoodEffectTarget` / `ResidentEffectTarget`
  permit, and throws rather than silently applying an effect to a field like
  `population` that the contract doesn't allow.
- **No LLM in this loop, ever.** `resolveTurn()` never calls an external
  service; it's pure arithmetic over rows already in Postgres.

## 5. Why `pg` and not just `supabase-js`

Resolving a turn writes residents, neighborhoods, a city, and a snapshot
atomically — that needs a real `BEGIN`/`COMMIT` spanning multiple tables,
which PostgREST (what `supabase-js` talks to) can't express. The engine
connects directly to Postgres with the `pg` driver instead, using the same
effective privilege level as Supabase's `service_role` key (a direct Postgres
connection bypasses RLS entirely). Read-only API routes use the same `pg`
pool for consistency — there's only one DB client in this codebase.

One gotcha this required handling: `pg` returns `numeric`/`decimal` columns
as **strings** by default (to avoid silent precision loss), the opposite of
PostgREST, which serialises them as JSON numbers. [lib/db.ts](lib/db.ts)
installs a global type parser so every numeric column comes back as a JS
`number`, matching the types in `database.ts`.

## 6. API surface

| Method & path | Does |
| --- | --- |
| `GET /api/city/:id` | Current city state |
| `GET /api/city/:id/neighborhoods` | Read-only |
| `GET /api/city/:id/residents` | Read-only |
| `GET /api/policies` | The global policy catalogue |
| `POST /api/city/:id/decisions` | Queue a policy decision for the city's current turn (`{ policy_id, player_reasoning? }`) — inserts only, applies nothing |
| `POST /api/city/:id/resolve-turn` | Applies every decision queued for the current turn and advances it |

Status codes: `200`/`201` success, `400` bad request body, `404` city/policy
not found, `409` conflict (duplicate decision for the same city+turn+policy,
or the turn's snapshot already exists), `500` unexpected or data-integrity
errors. Full request/response examples are in [../README.md](../README.md#example-requests).

The frontend never queries Postgres directly — it goes through
[../src/lib/apiClient.ts](../src/lib/apiClient.ts) (`getCity`, `getNeighborhoods`,
`getResidents`, `getPolicies`, `createDecision`, `resolveTurn`), which are
thin typed `fetch` wrappers around the table above.

## 7. Determinism (why the seed looks the way it does)

Non-negotiable: re-running the seed must produce a byte-identical database,
because the engine's own reproducibility depends on the same guarantee (same
inputs → same turn resolution, always). So the seed uses no `random()`, no
`now()`, and no `gen_random_uuid()` for any simulated value — every resident
attribute comes from `md5(rowIndex || ':' || attributeName)`, truncated to 28
bits and scaled to `[0, 1)`.

That specific construction (md5, not a cheap multiplicative hash) is load
bearing: an earlier version used `((i*1000003 + salt) * 2654435761) % 997`,
which is *affine in `i`* and therefore produced perfectly correlated
"independent" attribute streams — concretely, zero students ever got
generated, because "young" and "draws the student occupation" had become
deterministically incompatible. Full story in
[supabase/README.md "Determinism"](supabase/README.md#determinism).

## 8. Testing

```bash
npm test                  # unit tests, no database needed (18 tests)
npm run test:integration  # requires DATABASE_URL pointed at a migrated+seeded Postgres (2 more)
```

The integration test resolves a real turn against the seeded Marrow Bay city
and checks the database afterward: turn advanced, snapshot written, treasury
untouched when a policy has no financial effect, transit/commute values moved
by exactly the policy's stated ops, and aggregates match an independent
recomputation. It is **not idempotent against a shared database** — it really
advances `current_turn` (there's no "undo," by design) — so point
`DATABASE_URL` at a disposable database for it, not a shared dev one.

## 9. Known limitations

The full list (with reasoning for each) lives in
[../README.md "Known limitations"](../README.md#known-limitations) and
[supabase/README.md "Known MVP limitations"](supabase/README.md#known-mvp-limitations).
The two most likely to matter to whoever builds the UI next:

- **`policies.upfront_cost` / `recurring_cost` are not auto-debited.**
  Treasury/revenue/expenses only move via explicit `effects.city` ops today.
- **A policy that sets `city.happiness`/`approval`/`unemployment` directly is
  overwritten in the same turn** by the mandatory recompute-from-residents
  step that runs right after effects apply (by design — those are derived
  fields). Only resident- and neighborhood-level effects durably move them.
