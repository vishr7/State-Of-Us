-- The city's cash on hand may never go below $0.
--
-- The application enforces this twice already: decisions the city can't pay for
-- are refused before they are queued (database/simulation/affordability.ts),
-- and the engine floors treasury at 0 whenever effects are applied. This
-- constraint is the last line of defence, so no code path -- present or future
-- -- can persist an overdrawn city.
--
-- NOT VALID: a city saved before this rule may already be overdrawn. Postgres
-- skips existing rows for a NOT VALID constraint but checks every INSERT and
-- UPDATE, and the engine floors treasury to 0 the next time such a city
-- resolves a turn, so it heals itself. Once no overdrawn cities remain,
--   alter table public.cities validate constraint cities_treasury_non_negative;
-- can be run to check the whole table.
alter table public.cities
  add constraint cities_treasury_non_negative check (treasury >= 0) not valid;

comment on column public.cities.treasury is
  'Cash on hand. Never negative: enforced by cities_treasury_non_negative, and before that by the affordability check and the engine floor.';
