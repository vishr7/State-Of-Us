-- Narrative/provider data is separate from canonical simulation state.
create table public.game_days (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  turn integer not null check (turn >= 0),
  status text not null check (status in ('preparing', 'ready', 'failed')),
  candidate_pool jsonb not null default '[]'::jsonb check (jsonb_typeof(candidate_pool) = 'array'),
  selected_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_ids) = 'array'),
  policy_hashes jsonb not null default '{}'::jsonb,
  generation_metadata jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (city_id, turn),
  unique (id, city_id, turn)
);

alter table public.decisions add column game_day_id uuid;
alter table public.decisions add column candidate_id text;
alter table public.decisions add constraint decisions_game_day_lineage
  foreign key (game_day_id, city_id, turn) references public.game_days(id, city_id, turn);
alter table public.decisions add constraint decisions_candidate_pair
  check ((game_day_id is null) = (candidate_id is null));
create unique index decisions_game_day_choice on public.decisions(game_day_id) where game_day_id is not null;

-- A provider failure is a narrative job failure, never a simulation rollback.
create table public.reaction_runs (
  decision_id uuid primary key references public.decisions(id) on delete cascade,
  status text not null check (status in ('pending', 'running', 'completed', 'failed', 'unconfigured')),
  model text,
  prompt_version text not null,
  error text,
  started_at timestamptz,
  completed_at timestamptz
);
create table public.resident_reactions (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete cascade,
  turn integer not null check (turn >= 0),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  game_day_id uuid not null references public.game_days(id),
  candidate_id text not null,
  resident_id uuid not null references public.residents(id),
  support numeric(4,3) not null check (support between 0 and 1),
  sentiment text not null check (sentiment in ('positive', 'neutral', 'negative')),
  reaction text not null,
  main_reason text not null,
  provenance jsonb not null,
  created_at timestamptz not null default now(),
  unique (decision_id, resident_id)
);
alter table public.game_days enable row level security;
alter table public.reaction_runs enable row level security;
alter table public.resident_reactions enable row level security;
create policy "game days are publicly readable" on public.game_days for select using (true);
create policy "reaction status is publicly readable" on public.reaction_runs for select using (true);
create policy "resident reactions are publicly readable" on public.resident_reactions for select using (true);
