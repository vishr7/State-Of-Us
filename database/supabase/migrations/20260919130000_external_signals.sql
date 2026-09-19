-- =============================================================================
-- State of Us — external signals
-- Migration: 20260919130000_external_signals
--
-- ARCHITECTURE RULE ENFORCED HERE
--   This table holds LLM-extracted facts scraped from external sources (e.g.
--   city press releases). It is reference/audit data ONLY: nothing in the
--   simulation engine reads from it, no foreign key ties it to cities,
--   neighborhoods, residents, or policies, and no trigger or generated column
--   derives canonical state from it. Same rule as decisions.player_reasoning
--   (see 20260919120000_initial_schema.sql) — an LLM may record what it found,
--   never decide what happens in the simulation.
-- =============================================================================

create type public.signal_category as enum (
  'employment',
  'housing',
  'infrastructure',
  'public_finance',
  'policy'
);

create type public.signal_geography_scope as enum (
  'city',
  'county',
  'metro',
  'state',
  'national'
);

create type public.signal_status as enum (
  'proposed',
  'announced',
  'in_progress',
  'completed'
);

-- -----------------------------------------------------------------------------
-- external_signals
-- -----------------------------------------------------------------------------
-- One row = one validated signal extracted from one scrape of one document.
-- `id` is a content hash (see lib/signals/pipeline.ts), not a random uuid, so
-- re-ingesting the same document with the same model/prompt version is a
-- natural no-op via `on conflict (id) do nothing`.
create table public.external_signals (
  id                text        primary key,
  document_id       text        not null,

  category          public.signal_category not null,
  headline          text        not null check (length(btrim(headline)) > 0),
  summary           text        not null check (length(btrim(summary)) > 0),

  geography_name    text        not null check (length(btrim(geography_name)) > 0),
  geography_scope   public.signal_geography_scope not null,

  event_date        date,
  status            public.signal_status not null,

  -- SignalDraft['evidence']: array of { quote: string }, verified verbatim
  -- against the source document at extraction time.
  evidence          jsonb       not null check (jsonb_typeof(evidence) = 'array'),

  -- SourceReference: { title, url, publisher, publishedAt }
  source            jsonb       not null check (jsonb_typeof(source) = 'object'),

  -- NormalizedDocument['provenance'] plus extractedAt/model/promptVersion.
  provenance        jsonb       not null check (jsonb_typeof(provenance) = 'object'),

  created_at        timestamptz not null default now()
);

comment on table public.external_signals is
  'LLM-extracted facts scraped from external sources. Reference/audit data only — never read by the simulation engine. Shape: ExternalSignal in lib/signals/types.ts.';
comment on column public.external_signals.id is
  'sha256([documentId, model, promptVersion, draft]) — stable across re-ingestion of the same document.';
comment on column public.external_signals.evidence is
  'Verbatim quotes from the source document supporting this signal. Never used as engine input.';

create index external_signals_document_id_idx
  on public.external_signals (document_id);

create index external_signals_category_idx
  on public.external_signals (category);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- Same convention as every other table: publicly readable, no write policy.
-- Only the ingest script, running server-side with a direct Postgres
-- connection (bypassing RLS), inserts rows.

alter table public.external_signals enable row level security;

create policy "external signals are publicly readable"
  on public.external_signals for select using (true);
