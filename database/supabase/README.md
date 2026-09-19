# State of Us — Database Schema

PostgreSQL schema for the MVP, targeting Supabase. Six tables, one seeded city.

| File | What it is |
| --- | --- |
| [migrations/20260919120000_initial_schema.sql](migrations/20260919120000_initial_schema.sql) | Enums, tables, FKs, indexes, RLS |
| [seed.sql](seed.sql) | 1 city, 4 neighborhoods, 100 households, 6 policies, 1 decision, turn-0 snapshot |
| [../types/database.ts](../types/database.ts) | TypeScript mirror + the two JSONB contracts |

Both files have been applied against PostgreSQL 18 and the seed verified for
determinism; see [Verification](#verification).

---

## The architecture rule, expressed in the schema

> The database and simulation engine are the source of truth. LLMs may generate
> reasoning and reactions but must never directly determine or mutate canonical
> game state.

Three mechanisms enforce this, so it can't erode as the code grows:

1. **There is exactly one LLM-writable column in the entire schema:**
   `decisions.player_reasoning`, which is nullable free text. No constraint, no
   generated column, no trigger, and no engine input reads it. **Deleting every
   byte of LLM-authored text must leave the simulation bit-for-bit
   reproducible** — that's the test to run if you're ever unsure whether some
   new feature violates the rule.

2. **RLS makes it a permission, not a convention.** Every table has a
   `for select using (true)` policy and *no* insert/update/delete policy. The
   browser (`anon`/`authenticated`) can read everything and write nothing. The
   engine runs server-side under the `service_role` key, which bypasses RLS. So
   even if LLM output reached the client, there is no write path for it.

3. **Policy effects are data, not prose.** `policies.effects` is a versioned,
   machine-readable JSONB contract (below). The engine executes it
   arithmetically. An LLM may *describe* what a policy did; it never decides.

> ⚠️ **RLS foot-gun.** A blocked `INSERT` raises an error, but a blocked
> `UPDATE`/`DELETE` returns `UPDATE 0` / `DELETE 0` **silently** — no matching
> row exists under a missing policy. Client code that ignores the affected-row
> count will look like it succeeded. Always check `count` on writes, or keep
> writes strictly server-side.

---

## Shape

```
cities ──1:N──> neighborhoods ──1:N──> residents
   │
   ├──1:N──> decisions ──N:1──> policies      (global catalogue)
   └──1:N──> simulation_snapshots             (unique per turn)
```

Delete behaviour is deliberate:

- `neighborhoods`, `residents`, `decisions`, `simulation_snapshots` all
  **cascade** from their city — deleting a city tears down one whole play session.
- `decisions.policy_id` is **`ON DELETE RESTRICT`**. A city's decision log is
  history and must survive catalogue edits. Retire a policy; don't delete it.
  (If you do need to drop a policy, delete the cities referencing it first —
  that's the ordering the seed's reset block uses.)

---

## Units and conventions

Getting these wrong is the most likely source of a silent simulation bug, so
they're also recorded as `COMMENT ON COLUMN` in the database itself.

| Concept | Convention |
| --- | --- |
| Money | `numeric(_, 2)`, whole currency units. Never float. |
| `income` | **Annual** gross, per household |
| `*_rent`, `housing_cost` | **Monthly** |
| `revenue`, `expenses` | **Annual** |
| `happiness`, `approval`, `transit_access` | 0–100 index |
| `unemployment` | 0–100 **percent of the labour force** (excludes `retired` and `student`) |
| `tax_sensitivity`, `housing_sensitivity`, `transit_sensitivity`, `government_trust` | 0–1 weight |
| Timestamps | `timestamptz`, UTC |

**A `residents` row is one household**, represented by its head. `family_size`
is how many people that row stands for, so:

```sql
population = sum(family_size)   -- NOT count(*)
```

100 resident rows in the seed therefore describe 226 people.

### Turn semantics

- `cities.current_turn` is the **next turn to resolve**. It is incremented only
  *after* the snapshot for the resolved turn has been committed.
- `simulation_snapshots(turn = N)` is the canonical state at the **start** of
  turn N, before any decision recorded at turn N has been applied.
- A `decisions` row at turn N is applied **when turn N is resolved**.

So resolving a turn is: read snapshot N → apply decisions at turn N → write
tables → write snapshot N+1 → `current_turn = N+1`. Do it in one transaction.

### Derived columns

These are **owned by the engine** and rewritten from `residents` every turn.
Never hand-edit them; they will be clobbered.

| Table | Derived from residents |
| --- | --- |
| `cities` | `population`, `happiness`, `approval`, `unemployment`, `average_rent` |
| `neighborhoods` | `population`, `average_income`, `average_rent`, `happiness` |

Everything else on `neighborhoods` (`property_value`, `housing_supply`, `jobs`,
`transit_access`) is authored or policy-driven and *not* derivable from
residents — that's why those four are the only neighborhood fields policy
effects may target.

They're denormalised rather than computed as views because the snapshot format
needs a flat, stable record of what the city looked like, and the client reads
city/neighborhood headline numbers far more often than the engine writes them.

---

## Enums

| Type | Values |
| --- | --- |
| `policy_category` | `housing`, `transit`, `taxation`, `employment`, `services`, `environment`, `safety` |
| `housing_status` | `owner`, `renter`, `subsidized`, `living_with_family`, `unhoused` |
| `resident_archetype` | `student`, `young_professional`, `service_worker`, `mid_career_renter`, `family_household`, `long_time_homeowner`, `small_business_owner`, `senior_fixed_income` |

Adding a value is additive and cheap:

```sql
alter type public.policy_category add value 'public_health';
```

Two caveats: the new value **cannot be used in the same transaction** that adds
it, and **removing** a value requires a full type swap (create new type → alter
columns → drop old). If a vocabulary starts churning during the hackathon,
convert that one to `text` + a `CHECK` rather than fighting it.

`occupation` is deliberately plain `text` — it's open-ended flavour. Three
values are **reserved and load-bearing**: `unemployed`, `retired`, and
`student`, which define the labour-force denominator for `unemployment`.

---

## JSONB contract: `policies.effects`

Typed as `PolicyEffects` in [database.ts](../types/database.ts). Guarded in
the DB by `check (jsonb_typeof(effects) = 'object')`.

```jsonc
{
  "version": 1,          // engine refuses versions it doesn't know
  "ramp_turns": 2,       // turns to fully phase in; 0/omitted = immediate
  "city":          { "revenue": { "op": "add", "value": 260000 } },
  "neighborhoods": [ { "where": { "transit_access_lt": 65 },
                       "set":   { "transit_access": { "op": "add", "value": 18 } } } ],
  "residents":     [ { "where": { "housing_statuses": ["renter"], "income_lt": 55000 },
                       "set":   { "housing_cost": { "op": "multiply", "value": 0.78 } } } ]
}
```

- Ops are `set`, `multiply`, `add`. The engine applies them in **that fixed
  order** so a bundle of policies is order-independent, and therefore
  deterministic.
- Selector predicates **AND** together. An omitted or empty `where` matches
  everything.
- Only non-derived fields are targetable — the engine recomputes the derived
  ones afterwards. The `*EffectTarget` unions in `database.ts` are the
  authoritative list.

Queryable via the GIN index:

```sql
select name from policies where effects @> '{"city": {}}';          -- touches city finances
select name from policies where effects @> '{"ramp_turns": 2}';
```

## JSONB contract: `simulation_snapshots.state`

Typed as `SimulationState`. Full canonical state — city + every neighborhood +
every resident — so a snapshot can restore the tables verbatim and replay
forward.

**Scale note:** this embeds all resident rows. At 100 households that's ~7.5 KB
per turn, which is fine. Past a few thousand residents, switch to a content hash
plus a diff against the previous snapshot.

The seed builds the turn-0 snapshot by **reading the tables back** rather than
restating literals, so it cannot drift from the rows it describes. Do the same
in the engine.

---

## Indexes

Deliberately lean. Every PK and unique constraint already creates a btree, and
Postgres uses the **leading columns** of a composite index, so several "obvious"
indexes would be pure write overhead. Created:

| Index | Why |
| --- | --- |
| `residents (neighborhood_id)` | Hot path — the engine loads every household in a neighborhood each turn |
| `decisions (policy_id)` | FK lookup ("which cities enacted this?"); not a prefix of any existing index |
| `policies (category)` | Policy picker filters the catalogue |
| `policies USING gin (effects jsonb_path_ops)` | Find policies touching a metric. `jsonb_path_ops` is ~3× smaller than the default opclass and supports `@>` |

**Intentionally not created**, because an existing constraint's index already
covers them:

| Not created | Covered by |
| --- | --- |
| `neighborhoods (city_id)` | `unique (city_id, name)` |
| `decisions (city_id, turn)` | `unique (city_id, turn, policy_id)` |
| `simulation_snapshots (city_id, turn)` | its own unique constraint |

No `DESC` variants: btrees scan backwards, so `order by turn desc` uses the
ascending index. No GIN on `simulation_snapshots.state` — snapshots are written
once and read whole by key; indexing the blob would cost write throughput for
queries we never run.

---

## The seed

Run it and you get **Marrow Bay**: four neighborhoods with deliberately
different pressure profiles, so policies have something real to trade off.

| Neighborhood | Households | People | Avg income | Avg rent | Happiness | Transit | Character |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Harbor Point | 22 | 37 | 139,090 | 3,332 | 70.5 | 88 | Wealthy, transit-rich, supply-starved |
| Mill District | 30 | 60 | 55,852 | 1,953 | 52.7 | 64 | Working class, in transition |
| Eastbrook | 26 | 74 | 88,140 | 2,557 | 55.6 | 31 | Suburban, car-dependent, family-heavy |
| Kestrel Flats | 22 | 55 | 42,313 | 1,307 | 48.2 | 34 | Low income, poor transit, high unemployment |

City totals: **226 people**, happiness **56.38**, approval **53.40**,
unemployment **11.49%**, average rent **2,269**, treasury **1.24M** against
**1.69M** revenue / **1.60M** expenses / **4.35M** debt.

### Determinism

Non-negotiable: `supabase db reset` must produce a byte-identical database,
because the engine's reproducibility tests diff against this seed.

- No `random()`, no `now()` in any simulated value, no `gen_random_uuid()`.
  Every id is fixed (residents are `44444444-…-<index>`).
- Every attribute comes from `md5(i || ':' || salt)` → first 28 bits → `[0,1)`.

  **Why md5 and not a cheap multiplicative hash:** the first version used
  `((i*1000003 + salt) * 2654435761) % 997`. Because `1000003 ≡ 12 (mod 997)`,
  that's *affine in `i`* — every salt yields the same sequence rotated by a
  constant, so the streams were perfectly correlated. In practice the seed
  produced **zero students**, because "young" and "draws the student
  occupation" had become deterministically incompatible conditions. Every
  sensitivity was also a hidden function of age. If you add an attribute
  stream, add a new md5 salt; don't reintroduce a linear mixer.

- **Aggregates are derived, not typed.** Residents are inserted first, then
  neighborhood and city aggregates are computed from them with `UPDATE … FROM`.
  Change a resident and re-run; everything stays consistent.
- The seed is **re-runnable** — it deletes its own fixtures by fixed id first
  (city before policies, per the `RESTRICT` ordering).

### Running it

```bash
supabase db reset          # applies migrations + seed.sql
```

Or against any Postgres 13+:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260919120000_initial_schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

`gen_random_uuid()` is core in PostgreSQL 13+, so no extension is needed.

---

## Verification

Both files were applied to a scratch PostgreSQL 18 cluster and checked:

- migration and seed apply cleanly under `ON_ERROR_STOP=1`; seed re-runs clean
- 100 residents / 226 people; all 8 archetypes and all 5 housing statuses present
- re-running the seed reproduces an identical digest of every resident row
- attribute streams decorrelated (`corr(family_size, government_trust) = -0.005`;
  remaining correlations trace to intended structure, e.g. income → tax sensitivity)
- `anon` can read; `INSERT` errors, `UPDATE`/`DELETE` affect 0 rows
- turn-0 snapshot: 4 neighborhoods, 100 residents, city population matches the
  table, no `created_at`/`updated_at` leakage, 7.5 KB
- `database.ts` compiles under `tsc --strict`, and the **seeded `effects` and
  `state` JSON type-check against `PolicyEffects` / `SimulationState`**

Re-check aggregates any time with the queries at the bottom of `seed.sql`.

---

## Known MVP limitations

Called out so nobody discovers them at 3am:

- **`database.ts` is hand-maintained.** Change the migration and this file in
  the same commit. Once Supabase is live you can replace it with
  `supabase gen types typescript` — but you'll then need to re-attach the
  `PolicyEffects` / `SimulationState` types, which codegen emits as `Json`.
- **`numeric` arrives as a JS `number`.** PostgREST serialises `numeric` as a
  JSON number (unlike node-postgres, which gives you a string). Do currency
  arithmetic in the engine with integers or a decimal library; don't accumulate
  these floats.
- **No append-only enforcement.** `decisions` and `simulation_snapshots` are
  append-only by convention. RLS blocks the client, but the engine's
  `service_role` could still rewrite history. Add a trigger if that matters.
- **Snapshots embed full resident state** — see the scale note above.
- **`policies` is global, not city-scoped.** Fine for one deck; if cities need
  bespoke policies, add a nullable `policies.city_id`.
- **No `updated_at` on `neighborhoods` / `residents` / `policies`**, matching the
  MVP column spec. The trigger function `set_updated_at()` already exists, so
  adding them later is two lines per table.
