-- Preserve legacy projections; store the versioned v2 response without inventing old evaluations.
alter table public.resident_reactions add column evaluation jsonb
  check (evaluation is null or jsonb_typeof(evaluation) = 'object');
alter table public.resident_reactions drop constraint resident_reactions_sentiment_check;
alter table public.resident_reactions add constraint resident_reactions_sentiment_check
  check (sentiment in ('very_negative','negative','neutral','mixed','positive','very_positive'));
comment on column public.resident_reactions.evaluation is
  'Validated resident-outcome-v2 response. Null for legacy records, which require re-evaluation rather than fabricated impact fields.';
