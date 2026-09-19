-- =============================================================================
-- State of Us — initial schema (MVP)
-- Migration: 20260919120000_initial_schema
--
-- ARCHITECTURE RULE ENFORCED HERE
--   The database + the deterministic simulation engine are the source of truth.
--   LLM output is narrative only. It lands exclusively in free-text columns
--   (decisions.player_reasoning) and is never referenced by a constraint, a
--   generated column, a trigger, or any engine input. Deleting every byte of
--   LLM-written text must leave the simulation bit-for-bit reproducible.
--
-- UNITS (see supabase/README.md for the full contract)
--   money            : whole currency units, numeric(_, 2). Monthly where the
--                      column name says "rent"/"cost", annual otherwise.
--   happiness        : 0-100 index
--   approval         : 0-100 index
--   unemployment     : 0-100 percent of the labour force
--   transit_access   : 0-100 index
--   *_sensitivity    : 0-1 weight consumed by the engine's resident model
--   government_trust : 0-1
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
-- Closed vocabularies the engine branches on. Extend with:
--   alter type public.<name> add value 'new_value';
-- (additive only; removing a value requires a type swap — see README).

create type public.policy_category as enum (
  'housing',
  'transit',
  'taxation',
  'employment',
  'services',
  'environment',
  'safety'
);

create type public.housing_status as enum (
  'owner',
  'renter',
  'subsidized',
  'living_with_family',
  'unhoused'
);

create type public.resident_archetype as enum (
  'student',
  'young_professional',
  'service_worker',
  'mid_career_renter',
  'family_household',
  'long_time_homeowner',
  'small_business_owner',
  'senior_fixed_income'
);

-- -----------------------------------------------------------------------------
-- Shared trigger function
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- cities
-- -----------------------------------------------------------------------------
create table public.cities (
  id            uuid          primary key default gen_random_uuid(),
  name          text          not null
                              check (length(btrim(name)) between 1 and 120),

  -- Turn counter. Turn N has not been resolved yet; the engine advances this
  -- only after it has written the simulation_snapshots row for turn N.
  current_turn  integer       not null default 0 check (current_turn >= 0),

  -- Denormalised aggregates. Owned and rewritten by the engine every turn from
  -- the residents table; never hand-edited. See README "Derived columns".
  population    integer       not null default 0  check (population >= 0),
  treasury      numeric(14,2) not null default 0,               -- may go negative
  revenue       numeric(14,2) not null default 0  check (revenue  >= 0),
  expenses      numeric(14,2) not null default 0  check (expenses >= 0),
  debt          numeric(14,2) not null default 0  check (debt     >= 0),
  happiness     numeric(5,2)  not null default 50 check (happiness    between 0 and 100),
  approval      numeric(5,2)  not null default 50 check (approval     between 0 and 100),
  unemployment  numeric(5,2)  not null default 0  check (unemployment between 0 and 100),
  average_rent  numeric(12,2) not null default 0  check (average_rent >= 0),

  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create trigger cities_set_updated_at
  before update on public.cities
  for each row execute function public.set_updated_at();

comment on table public.cities is
  'One simulated city = one play session. Aggregate columns are derived from residents by the engine.';
comment on column public.cities.current_turn is
  'Next turn to resolve. Incremented only after the snapshot for the resolved turn is committed.';
comment on column public.cities.treasury is
  'Cash on hand. Allowed to be negative; the engine converts a negative balance into debt.';
comment on column public.cities.unemployment is
  'Percent (0-100) of the labour force, excluding residents whose occupation is retired or student.';

-- -----------------------------------------------------------------------------
-- neighborhoods
-- -----------------------------------------------------------------------------
create table public.neighborhoods (
  id              uuid          primary key default gen_random_uuid(),
  city_id         uuid          not null
                                references public.cities(id) on delete cascade,
  name            text          not null
                                check (length(btrim(name)) between 1 and 120),

  -- Derived from residents each turn.
  population      integer       not null default 0  check (population >= 0),
  average_income  numeric(12,2) not null default 0  check (average_income >= 0),
  average_rent    numeric(12,2) not null default 0  check (average_rent   >= 0),
  happiness       numeric(5,2)  not null default 50 check (happiness between 0 and 100),

  -- Authored / policy-driven. Not derivable from residents.
  property_value  numeric(14,2) not null default 0  check (property_value >= 0),
  housing_supply  integer       not null default 0  check (housing_supply >= 0),
  jobs            integer       not null default 0  check (jobs >= 0),
  transit_access  numeric(5,2)  not null default 0  check (transit_access between 0 and 100),

  -- Names are the stable human handle used by policy effect selectors.
  constraint neighborhoods_city_id_name_key unique (city_id, name)
);

comment on column public.neighborhoods.average_rent is
  'Mean MONTHLY housing_cost across residents whose housing_status is renter or subsidized.';
comment on column public.neighborhoods.property_value is
  'Median home value. Policy-driven, not derived from residents.';
comment on column public.neighborhoods.housing_supply is
  'Dwelling units. Compare against the household count to derive vacancy / shortfall.';

-- -----------------------------------------------------------------------------
-- residents
-- -----------------------------------------------------------------------------
-- One row = one HOUSEHOLD, represented by its head. `family_size` is how many
-- people that row stands for, so population = sum(family_size).
create table public.residents (
  id                   uuid                     primary key default gen_random_uuid(),
  neighborhood_id      uuid                     not null
                                                references public.neighborhoods(id) on delete cascade,

  age                  smallint                 not null check (age between 0 and 120),
  income               numeric(12,2)            not null default 0 check (income >= 0),  -- annual
  occupation           text                     not null
                                                check (length(btrim(occupation)) > 0),
  housing_status       public.housing_status    not null,
  housing_cost         numeric(10,2)            not null default 0 check (housing_cost >= 0), -- monthly
  commute_minutes      smallint                 not null default 0 check (commute_minutes between 0 and 240),
  family_size          smallint                 not null default 1 check (family_size between 1 and 12),

  -- Behavioural weights consumed by the deterministic resident model.
  tax_sensitivity      numeric(4,3)             not null check (tax_sensitivity     between 0 and 1),
  housing_sensitivity  numeric(4,3)             not null check (housing_sensitivity between 0 and 1),
  transit_sensitivity  numeric(4,3)             not null check (transit_sensitivity between 0 and 1),
  government_trust     numeric(4,3)             not null check (government_trust    between 0 and 1),

  happiness            numeric(5,2)             not null default 50 check (happiness between 0 and 100),
  archetype            public.resident_archetype not null
);

comment on table public.residents is
  'One row per household. Sensitivities are engine inputs only — the LLM may read them to write flavour text, never write them.';
comment on column public.residents.family_size is
  'People represented by this household row. population = sum(family_size).';
comment on column public.residents.income is
  'Annual gross household income.';
comment on column public.residents.housing_cost is
  'Monthly rent or mortgage payment. 0 for unhoused.';

-- -----------------------------------------------------------------------------
-- policies
-- -----------------------------------------------------------------------------
-- Global catalogue, not city-scoped: every city draws from the same deck.
create table public.policies (
  id              uuid                  primary key default gen_random_uuid(),
  name            text                  not null unique
                                        check (length(btrim(name)) between 1 and 160),
  description     text                  not null default '',
  upfront_cost    numeric(14,2)         not null default 0 check (upfront_cost >= 0),
  -- Negative recurring_cost = net recurring REVENUE (e.g. a tax increase).
  recurring_cost  numeric(14,2)         not null default 0,
  category        public.policy_category not null,
  effects         jsonb                 not null default '{}'::jsonb
                                        check (jsonb_typeof(effects) = 'object')
);

comment on column public.policies.recurring_cost is
  'Per-turn operating cost. Negative means the policy is net revenue-positive.';
comment on column public.policies.effects is
  'Versioned, machine-readable effect contract consumed by the engine. Shape: PolicyEffects in src/types/database.ts.';

-- -----------------------------------------------------------------------------
-- decisions
-- -----------------------------------------------------------------------------
create table public.decisions (
  id               uuid        primary key default gen_random_uuid(),
  city_id          uuid        not null references public.cities(id) on delete cascade,
  -- restrict, not cascade: a city's decision log is history and must survive
  -- catalogue edits. Retire a policy instead of deleting it.
  policy_id        uuid        not null references public.policies(id) on delete restrict,
  turn             integer     not null check (turn >= 0),
  -- The only column an LLM may author. Narrative only.
  player_reasoning text,
  created_at       timestamptz not null default now(),

  constraint decisions_city_turn_policy_key unique (city_id, turn, policy_id)
);

comment on table public.decisions is
  'Append-only log of policies enacted. A decision recorded at turn N is applied when turn N is resolved.';
comment on column public.decisions.player_reasoning is
  'Free text (player- or LLM-authored). NEVER read by the simulation engine.';

-- -----------------------------------------------------------------------------
-- simulation_snapshots
-- -----------------------------------------------------------------------------
create table public.simulation_snapshots (
  id         uuid        primary key default gen_random_uuid(),
  city_id    uuid        not null references public.cities(id) on delete cascade,
  turn       integer     not null check (turn >= 0),
  state      jsonb       not null check (jsonb_typeof(state) = 'object'),
  created_at timestamptz not null default now(),

  -- Exactly one canonical snapshot per (city, turn). This is what makes replay
  -- and "rewind to turn N" well-defined.
  constraint simulation_snapshots_city_turn_key unique (city_id, turn)
);

comment on table public.simulation_snapshots is
  'Immutable canonical state at the START of each turn. Replay source of truth. Shape: SimulationState in src/types/database.ts.';

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
-- Deliberately lean. Every primary key and unique constraint already creates a
-- btree, and Postgres uses the LEADING COLUMNS of a composite index, so these
-- would be redundant and are intentionally NOT created:
--   neighborhoods(city_id)           -> covered by unique (city_id, name)
--   decisions(city_id, turn)         -> covered by unique (city_id, turn, policy_id)
--   simulation_snapshots(city_id, turn) -> covered by its own unique constraint
--     (a DESC variant is unnecessary; btrees scan backwards for `order by turn desc`)

-- Hot path: the engine loads every household in a neighborhood each turn.
create index residents_neighborhood_id_idx
  on public.residents (neighborhood_id);

-- FK lookup for "which cities enacted this policy". Not a prefix of any
-- existing index, so it needs its own.
create index decisions_policy_id_idx
  on public.decisions (policy_id);

-- Policy picker UI filters the catalogue by category.
create index policies_category_idx
  on public.policies (category);

-- Find policies that touch a given metric, e.g.
--   where effects @> '{"city": {"unemployment": {}}}'
-- jsonb_path_ops is ~3x smaller than the default opclass and supports @>.
create index policies_effects_idx
  on public.policies using gin (effects jsonb_path_ops);

-- No GIN on simulation_snapshots.state on purpose: snapshots are written once
-- and read whole by primary key or (city_id, turn). Indexing the blob would
-- cost write throughput for queries we never run.

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- Reads are public (the client renders the city). Writes have NO policy at all,
-- so anon/authenticated cannot mutate anything. The simulation engine runs
-- server-side with the service_role key, which bypasses RLS. This is the
-- architecture rule expressed as a permission: only the engine mutates state.

alter table public.cities               enable row level security;
alter table public.neighborhoods        enable row level security;
alter table public.residents            enable row level security;
alter table public.policies             enable row level security;
alter table public.decisions            enable row level security;
alter table public.simulation_snapshots enable row level security;

create policy "cities are publicly readable"
  on public.cities for select using (true);

create policy "neighborhoods are publicly readable"
  on public.neighborhoods for select using (true);

create policy "residents are publicly readable"
  on public.residents for select using (true);

create policy "policies are publicly readable"
  on public.policies for select using (true);

create policy "decisions are publicly readable"
  on public.decisions for select using (true);

create policy "simulation snapshots are publicly readable"
  on public.simulation_snapshots for select using (true);
