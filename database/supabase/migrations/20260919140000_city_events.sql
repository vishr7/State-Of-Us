-- =============================================================================
-- State of Us — city events
-- Migration: 20260919140000_city_events
--
-- ARCHITECTURE RULE ENFORCED HERE
--   This table records the outcome of the scrape -> Gemini supervisor ->
--   Nemotron pipeline: for each external_signals row the supervisor picked,
--   `effects` is the PolicyEffects-shaped JSON Nemotron decided and that
--   database/simulation/applyPolicyEffects.ts already applied to the city
--   before this row was inserted. Same contract, same interpreter, same
--   target whitelist as policies.effects — an event is just an
--   LLM-authored, one-off "policy" instead of a human-authored catalogue one.
--   `effects` is written here for audit/UI display only; it is never re-read
--   as engine input (the mutation already happened in the same transaction).
-- =============================================================================

create table public.city_events (
  id                  uuid        primary key default gen_random_uuid(),
  city_id             uuid        not null references public.cities(id) on delete cascade,
  external_signal_id  text        not null references public.external_signals(id),

  turn                integer     not null check (turn >= 0),

  category            public.signal_category not null,
  headline            text        not null check (length(btrim(headline)) > 0),
  summary             text        not null check (length(btrim(summary)) > 0),

  -- Gemini supervisor's one-sentence reason this signal was one of the five picked.
  supervisor_rationale text       not null,
  supervisor_source    text       not null check (supervisor_source in ('gemini', 'scripted')),

  -- PolicyEffects (version 1) that were applied to the city/neighborhoods/residents.
  effects             jsonb       not null check (jsonb_typeof(effects) = 'object'),
  effects_source      text        not null check (effects_source in ('nemotron', 'scripted')),
  effects_model       text,

  created_at          timestamptz not null default now(),

  -- A given scraped signal becomes at most one event per city.
  unique (city_id, external_signal_id)
);

comment on table public.city_events is
  'One row = one scraped signal the Gemini supervisor selected and Nemotron turned into applied PolicyEffects. Audit trail for the UI event feed.';
comment on column public.city_events.effects is
  'PolicyEffects (see database/types/database.ts) already applied via applyPolicyEffects.ts in the same transaction this row was inserted in.';

create index city_events_city_id_idx on public.city_events (city_id, created_at desc);

alter table public.city_events enable row level security;

create policy "city events are publicly readable"
  on public.city_events for select using (true);
