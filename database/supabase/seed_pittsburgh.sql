-- =============================================================================
-- State of Us — Pittsburgh seed  (GENERATED — do not edit by hand)
--
--   npx tsx scripts/generate-pittsburgh-seed.ts
--
-- Creates: 1 city (Pittsburgh), 10 neighborhoods, 159 resident households,
--          18 catalogue policies, 1 turn-0 snapshot.
--
-- This is the dataset the CityPulse frontend runs on. Neighborhood and policy
-- NAMES are the join key with lib/mockData.ts (see lib/backend.ts), and the
-- policy rows are emitted from that same list. Resident households are built
-- by the same deterministic md5-stream generator as seed.sql — re-running
-- yields a byte-identical database.
--
-- Independent of seed.sql (Marrow Bay): apply either or both. Safe to re-run.
-- =============================================================================

begin;

-- City first: cascades to neighborhoods -> residents, and to decisions. Only
-- then can the policies be removed (decisions.policy_id is ON DELETE RESTRICT).
delete from public.cities where id = '77777777-7777-4777-8777-000000000001'::uuid;

delete from public.policies
 where id in (
   '99999999-9999-4999-8999-000000000001'::uuid,
   '99999999-9999-4999-8999-000000000002'::uuid,
   '99999999-9999-4999-8999-000000000003'::uuid,
   '99999999-9999-4999-8999-000000000004'::uuid,
   '99999999-9999-4999-8999-000000000005'::uuid,
   '99999999-9999-4999-8999-000000000006'::uuid,
   '99999999-9999-4999-8999-000000000007'::uuid,
   '99999999-9999-4999-8999-000000000008'::uuid,
   '99999999-9999-4999-8999-000000000009'::uuid,
   '99999999-9999-4999-8999-000000000010'::uuid,
   '99999999-9999-4999-8999-000000000011'::uuid,
   '99999999-9999-4999-8999-000000000012'::uuid,
   '99999999-9999-4999-8999-000000000013'::uuid,
   '99999999-9999-4999-8999-000000000014'::uuid,
   '99999999-9999-4999-8999-000000000015'::uuid,
   '99999999-9999-4999-8999-000000000016'::uuid,
   '99999999-9999-4999-8999-000000000017'::uuid,
   '99999999-9999-4999-8999-000000000018'::uuid
 );

-- Fiscal figures come from the frontend's opening state. No debt is modelled
-- on the frontend side, so none is invented here.
insert into public.cities
  (id, name, current_turn, treasury, revenue, expenses, debt)
values
  ('77777777-7777-4777-8777-000000000001', 'Pittsburgh', 0,
   2480000.00, 2910000.00, 2430000.00, 0.00);

insert into public.neighborhoods
  (id, city_id, name, property_value, housing_supply, jobs, transit_access)
values
  ('88888888-8888-4888-8888-000000000001', '77777777-7777-4777-8777-000000000001', 'Shadyside', 385000.00, 7100, 4200, 62.00),
  ('88888888-8888-4888-8888-000000000002', '77777777-7777-4777-8777-000000000001', 'Lawrenceville', 248000.00, 4800, 3100, 70.00),
  ('88888888-8888-4888-8888-000000000003', '77777777-7777-4777-8777-000000000001', 'Homewood', 68000.00, 4200, 900, 72.00),
  ('88888888-8888-4888-8888-000000000004', '77777777-7777-4777-8777-000000000001', 'Oakland', 312000.00, 14000, 42000, 85.00),
  ('88888888-8888-4888-8888-000000000005', '77777777-7777-4777-8777-000000000001', 'Golden Triangle', 520000.00, 2200, 78000, 95.00),
  ('88888888-8888-4888-8888-000000000006', '77777777-7777-4777-8777-000000000001', 'Mount Washington', 195000.00, 4500, 1200, 55.00),
  ('88888888-8888-4888-8888-000000000007', '77777777-7777-4777-8777-000000000001', 'Hill District', 55000.00, 7800, 1400, 68.00),
  ('88888888-8888-4888-8888-000000000008', '77777777-7777-4777-8777-000000000001', 'Strip District', 295000.00, 1800, 5200, 78.00),
  ('88888888-8888-4888-8888-000000000009', '77777777-7777-4777-8777-000000000001', 'South Side Flats', 172000.00, 6200, 3800, 64.00),
  ('88888888-8888-4888-8888-000000000010', '77777777-7777-4777-8777-000000000001', 'Hazelwood', 58000.00, 3400, 700, 56.00);

-- Households: 159 rows, proportional to each neighborhood's frontend population.
with bucket (
  name, lo, hi,
  income_base, income_span,
  rent_base,
  age_base, age_span,
  commute_base, commute_span,
  trust_base, owner_share, unemp_share, fam_span,
  unhoused_share, subsidized_share,
  occupations
) as (
  values
    ('Shadyside', 1, 22, 80000::numeric, 46000::numeric, 1840::numeric, 24, 46, 22, 16, 0.6::numeric, 0.3::numeric, 0.015::numeric, 2.4::numeric, 0::numeric, 0.02::numeric, array['software_engineer','physician','finance_analyst','attorney','professor']::text[]),
    ('Lawrenceville', 23, 36, 44000::numeric, 26000::numeric, 1430::numeric, 22, 48, 24, 18, 0.52::numeric, 0.2::numeric, 0.03::numeric, 2.6::numeric, 0.01::numeric, 0.05::numeric, array['nurse','teacher','logistics_coordinator','retail_manager','electrician']::text[]),
    ('Homewood', 37, 47, 24000::numeric, 14000::numeric, 690::numeric, 20, 56, 34, 22, 0.38::numeric, 0.35::numeric, 0.07::numeric, 3.6::numeric, 0.04::numeric, 0.14::numeric, array['retail_associate','home_health_aide','line_cook','rideshare_driver','warehouse_picker']::text[]),
    ('Oakland', 48, 89, 34000::numeric, 22000::numeric, 1500::numeric, 18, 40, 16, 14, 0.52::numeric, 0.08::numeric, 0.03::numeric, 2::numeric, 0.01::numeric, 0.05::numeric, array['research_technician','lab_assistant','university_staff','nurse','barista']::text[]),
    ('Golden Triangle', 90, 95, 70000::numeric, 42000::numeric, 1950::numeric, 24, 40, 12, 12, 0.6::numeric, 0.04::numeric, 0.015::numeric, 1.8::numeric, 0::numeric, 0.02::numeric, array['software_engineer','physician','finance_analyst','attorney','professor']::text[]),
    ('Mount Washington', 96, 108, 41000::numeric, 24000::numeric, 1100::numeric, 22, 50, 30, 20, 0.52::numeric, 0.45::numeric, 0.03::numeric, 2.8::numeric, 0::numeric, 0.05::numeric, array['nurse','teacher','logistics_coordinator','retail_manager','electrician']::text[]),
    ('Hill District', 109, 128, 19000::numeric, 11000::numeric, 630::numeric, 20, 56, 32, 22, 0.36::numeric, 0.3::numeric, 0.07::numeric, 3.6::numeric, 0.04::numeric, 0.14::numeric, array['retail_associate','home_health_aide','line_cook','rideshare_driver','warehouse_picker']::text[]),
    ('Strip District', 129, 133, 52000::numeric, 30000::numeric, 1650::numeric, 22, 44, 20, 16, 0.52::numeric, 0.1::numeric, 0.03::numeric, 2.2::numeric, 0::numeric, 0.05::numeric, array['nurse','teacher','logistics_coordinator','retail_manager','electrician']::text[]),
    ('South Side Flats', 134, 151, 38000::numeric, 22000::numeric, 1160::numeric, 20, 46, 22, 18, 0.52::numeric, 0.22::numeric, 0.03::numeric, 2.4::numeric, 0.01::numeric, 0.05::numeric, array['nurse','teacher','logistics_coordinator','retail_manager','electrician']::text[]),
    ('Hazelwood', 152, 159, 22000::numeric, 13000::numeric, 700::numeric, 20, 56, 34, 22, 0.38::numeric, 0.4::numeric, 0.06::numeric, 3.4::numeric, 0.03::numeric, 0.14::numeric, array['retail_associate','home_health_aide','line_cook','rideshare_driver','warehouse_picker']::text[])
),

idx as (
  select generate_series(1, 159) as i
),

-- Independent uniform streams, one per attribute.
--
-- The mixing function MUST be non-linear. A multiplicative hash of the form
-- ((i*A + salt) * B) % M is affine in i, so every salt produces the same
-- sequence rotated by a constant — the streams end up perfectly correlated and
-- attributes silently lock together (e.g. "young" would imply a fixed
-- occupation draw, making students impossible). md5 decorrelates them.
--
-- 7 hex chars -> bit(28) -> a non-negative int in [0, 2^28), divided by 2^28.
-- md5() is deterministic and stable across Postgres versions, so this stays
-- reproducible.
base as (
  select
    idx.i,
    n.id             as neighborhood_id,
    n.transit_access,
    b.income_base, b.income_span, b.rent_base,
    b.age_base, b.age_span,
    b.commute_base, b.commute_span,
    b.trust_base, b.owner_share, b.unemp_share, b.fam_span,
    b.unhoused_share, b.subsidized_share, b.occupations,
    (('x' || substr(md5(idx.i::text || ':age'),        1, 7))::bit(28)::int)::numeric / 268435456.0 as u_age,
    (('x' || substr(md5(idx.i::text || ':income'),     1, 7))::bit(28)::int)::numeric / 268435456.0 as u_income,
    (('x' || substr(md5(idx.i::text || ':family'),     1, 7))::bit(28)::int)::numeric / 268435456.0 as u_family,
    (('x' || substr(md5(idx.i::text || ':employment'), 1, 7))::bit(28)::int)::numeric / 268435456.0 as u_employment,
    (('x' || substr(md5(idx.i::text || ':occupation'), 1, 7))::bit(28)::int)::numeric / 268435456.0 as u_occupation,
    (('x' || substr(md5(idx.i::text || ':housing'),    1, 7))::bit(28)::int)::numeric / 268435456.0 as u_housing,
    (('x' || substr(md5(idx.i::text || ':housingalt'), 1, 7))::bit(28)::int)::numeric / 268435456.0 as u_housing_alt,
    (('x' || substr(md5(idx.i::text || ':cost'),       1, 7))::bit(28)::int)::numeric / 268435456.0 as u_cost,
    (('x' || substr(md5(idx.i::text || ':commute'),    1, 7))::bit(28)::int)::numeric / 268435456.0 as u_commute,
    (('x' || substr(md5(idx.i::text || ':trust'),      1, 7))::bit(28)::int)::numeric / 268435456.0 as u_trust,
    (('x' || substr(md5(idx.i::text || ':tax'),        1, 7))::bit(28)::int)::numeric / 268435456.0 as u_tax,
    (('x' || substr(md5(idx.i::text || ':hsens'),      1, 7))::bit(28)::int)::numeric / 268435456.0 as u_hsens,
    (('x' || substr(md5(idx.i::text || ':tsens'),      1, 7))::bit(28)::int)::numeric / 268435456.0 as u_tsens,
    (('x' || substr(md5(idx.i::text || ':mood'),       1, 7))::bit(28)::int)::numeric / 268435456.0 as u_mood,
    (('x' || substr(md5(idx.i::text || ':archetype'),  1, 7))::bit(28)::int)::numeric / 268435456.0 as u_archetype
  from idx
  join bucket b
    on idx.i between b.lo and b.hi
  join public.neighborhoods n
    on n.city_id = '77777777-7777-4777-8777-000000000001'::uuid
   and n.name = b.name
),

-- Age, labour-force status, occupation, income, household size.
demo as (
  select
    base.*,
    (age_base + floor(u_age * age_span))::smallint                  as age,
    (1 + floor(u_family * fam_span))::smallint                      as family_size,
    ((age_base + floor(u_age * age_span)) between 18 and 28)
      and u_occupation < 0.40                                       as is_student,
    (age_base + floor(u_age * age_span)) >= 66                      as is_retired
  from base
),

labour as (
  select
    demo.*,
    (not is_student and not is_retired and u_employment < unemp_share) as is_unemployed
  from demo
),

econ as (
  select
    labour.*,
    case
      when is_student    then 'student'
      when is_retired    then 'retired'
      when is_unemployed then 'unemployed'
      else occupations[1 + floor(u_occupation * array_length(occupations, 1))::int]
    end as occupation,
    round(
      case
        when is_student    then 9000 + u_income * 14000
        when is_retired    then income_base * 0.32 + u_income * income_span * 0.22
        when is_unemployed then 11000 + u_income * 9000
        else income_base + u_income * income_span
      end
    , 2) as income
  from labour
),

-- Tenure is drawn from one stream with cumulative thresholds so the shares in
-- `bucket` are exactly what they claim to be.
housing as (
  select
    econ.*,
    (case
       -- Students, and young adults generally, disproportionately live at home.
       when is_student and u_housing_alt < 0.45         then 'living_with_family'
       when age < 26   and u_housing_alt < 0.30         then 'living_with_family'
       when u_housing < unhoused_share                  then 'unhoused'
       when u_housing < unhoused_share
                      + subsidized_share                then 'subsidized'
       when u_housing < unhoused_share
                      + subsidized_share
                      + owner_share                     then 'owner'
       else 'renter'
     end)::public.housing_status as housing_status
  from econ
),

costs as (
  select
    housing.*,
    round(
      case housing_status
        when 'unhoused'           then 0
        when 'living_with_family' then rent_base * 0.18
        -- Subsidised households are capped at 30% of income, or 55% of market.
        when 'subsidized'         then least(income / 12 * 0.30, rent_base * 0.55)
        when 'owner'              then rent_base * (0.92 + u_cost * 0.50)
        else                           rent_base * (0.80 + u_cost * 0.55)
      end
    , 2) as housing_cost,
    (case
       when is_retired or is_unemployed then 0
       else commute_base + floor(u_commute * commute_span)
     end)::smallint as commute_minutes
  from housing
),

-- Behavioural weights + happiness. These formulas mirror the engine's resident
-- model so turn 0 is a fixed point: re-running the model over the seed changes
-- nothing until a policy lands.
psych as (
  select
    costs.*,
    least(income / 160000.0, 1.0)                                as income_norm,
    least(
      case when income > 0 then (housing_cost * 12) / income else 1.0 end
    , 1.0)                                                       as rent_burden,
    (housing_status in ('renter', 'subsidized'))                 as is_renter,
    (housing_status = 'owner')                                   as is_owner
  from costs
),

scored as (
  select
    psych.*,
    round(least(greatest(
      0.28
      + 0.42 * income_norm
      + 0.12 * (case when is_owner then 1 else 0 end)
      + 0.18 * (u_tax - 0.5)
    , 0.020), 0.990), 3) as tax_sensitivity,

    round(least(greatest(
      0.30
      + 0.55 * least(rent_burden / 0.60, 1.0)
      + 0.10 * (case when is_renter then 1 else 0 end)
      - 0.08 * (case when is_owner  then 1 else 0 end)
      + 0.16 * (u_hsens - 0.5)
    , 0.020), 0.990), 3) as housing_sensitivity,

    round(least(greatest(
      0.20
      + 0.0100 * commute_minutes
      + 0.30   * (1 - income_norm)
      - 0.0035 * transit_access
      + 0.16   * (u_tsens - 0.5)
    , 0.020), 0.990), 3) as transit_sensitivity,

    round(least(greatest(
      trust_base
      + 0.22 * (u_trust - 0.5)
      - 0.10 * (case when is_unemployed then 1 else 0 end)
      + 0.06 * (case when is_owner      then 1 else 0 end)
    , 0.020), 0.990), 3) as government_trust
  from psych
),

final as (
  select
    scored.*,
    round(least(greatest(
      74
      - 58   * greatest(rent_burden - 0.30, 0)           -- cost burden over 30%
      - 0.20 * commute_minutes                           -- time cost
      + 16   * (government_trust - 0.5)                  -- trust in city hall
      - 16   * (case when is_unemployed then 1 else 0 end)
      - 10   * (case when housing_status = 'unhoused' then 1 else 0 end)
      + 8    * (transit_access / 100.0 - 0.5)
      + 10   * (u_mood - 0.5)                            -- idiosyncratic mood
    , 0), 100), 2) as happiness,

    -- Ordered cascade; first match wins. `small_business_owner` is an explicit
    -- ~9% draw rather than the residual, otherwise it swallows every
    -- mid-career household that no earlier rule happens to catch.
    -- The residual is `mid_career_renter`: age 40-65, <=2 people, mid+ income,
    -- not an owner — which the age/tenure cuts above guarantee.
    (case
       when occupation = 'student'                  then 'student'
       when age >= 66                               then 'senior_fixed_income'
       when not (is_unemployed or is_retired)
            and u_archetype < 0.09                  then 'small_business_owner'
       when family_size >= 3                        then 'family_household'
       when is_owner and age >= 40                  then 'long_time_homeowner'
       when income < 52000                          then 'service_worker'
       when age <= 39                               then 'young_professional'
       else                                              'mid_career_renter'
     end)::public.resident_archetype as archetype
  from scored
)

insert into public.residents (
  id, neighborhood_id, age, income, occupation, housing_status, housing_cost,
  commute_minutes, family_size, tax_sensitivity, housing_sensitivity,
  transit_sensitivity, government_trust, happiness, archetype
)
select
  ('44444444-4444-4444-8445-' || lpad(i::text, 12, '0'))::uuid,
  neighborhood_id,
  age,
  income,
  occupation,
  housing_status,
  housing_cost,
  commute_minutes,
  family_size,
  tax_sensitivity,
  housing_sensitivity,
  transit_sensitivity,
  government_trust,
  happiness,
  archetype
from final
order by i;

-- Derived aggregates, from the residents just inserted.
update public.neighborhoods n
   set population     = agg.population,
       average_income = agg.average_income,
       average_rent   = agg.average_rent,
       happiness      = agg.happiness
  from (
    select
      r.neighborhood_id,
      sum(r.family_size)::int                       as population,
      round(avg(r.income), 2)                       as average_income,
      round(coalesce(
        avg(r.housing_cost) filter (
          where r.housing_status in ('renter', 'subsidized')
        ), 0), 2)                                   as average_rent,
      round(avg(r.happiness), 2)                    as happiness
    from public.residents r
    group by r.neighborhood_id
  ) agg
 where n.id = agg.neighborhood_id
   and n.city_id = '77777777-7777-4777-8777-000000000001'::uuid;

-- -----------------------------------------------------------------------------
-- 5. Derive city aggregates from the same residents
-- -----------------------------------------------------------------------------
update public.cities c
   set population   = agg.population,
       happiness    = agg.happiness,
       approval     = agg.approval,
       unemployment = agg.unemployment,
       average_rent = agg.average_rent
  from (
    select
      sum(r.family_size)::int    as population,
      round(avg(r.happiness), 2) as happiness,
      -- Approval blends lived experience with institutional trust.
      round(least(greatest(
        0.55 * avg(r.happiness) + 45 * avg(r.government_trust)
      , 0), 100), 2)             as approval,
      -- Percent of the LABOUR FORCE (retired and students excluded).
      round(
        100.0
        * count(*) filter (where r.occupation = 'unemployed')
        / nullif(count(*) filter (where r.occupation not in ('retired', 'student')), 0)
      , 2)                       as unemployment,
      round(coalesce(
        avg(r.housing_cost) filter (
          where r.housing_status in ('renter', 'subsidized')
        ), 0), 2)                as average_rent
    from public.residents r
    join public.neighborhoods n on n.id = r.neighborhood_id
    where n.city_id = '77777777-7777-4777-8777-000000000001'::uuid
  ) agg
 where c.id = '77777777-7777-4777-8777-000000000001'::uuid;

-- Policy catalogue: 18 policies, same list as the frontend.
insert into public.policies
  (id, name, description, upfront_cost, recurring_cost, category, effects)
values
  ('99999999-9999-4999-8999-000000000001',
   'Build Affordable Housing',
   'Add new low-cost housing units in Homewood.',
   800000.00, 0.00, 'housing',
   '{"version":1,"city":{"treasury":{"op":"add","value":-800000}},"neighborhoods":[{"where":{"names":["Homewood"]},"set":{"housing_supply":{"op":"add","value":180}}}],"residents":[{"where":{"neighborhood_names":["Homewood"],"housing_statuses":["renter","subsidized"]},"set":{"housing_cost":{"op":"multiply","value":0.94}}},{"where":{"neighborhood_names":["Homewood"]},"set":{"happiness":{"op":"add","value":8}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000002',
   'Expand Transit',
   'Add a new bus line and increase train frequency.',
   1200000.00, 60000.00, 'transit',
   '{"version":1,"city":{"treasury":{"op":"add","value":-1200000},"expenses":{"op":"add","value":60000}},"neighborhoods":[{"set":{"transit_access":{"op":"add","value":8}}},{"where":{"names":["Homewood","Lawrenceville"]},"set":{"transit_access":{"op":"add","value":6}}}],"residents":[{"where":{"income_lt":60000},"set":{"commute_minutes":{"op":"multiply","value":0.92}}},{"set":{"happiness":{"op":"add","value":3}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000003',
   'Raise Property Tax',
   'Increase property tax by 1% for residential areas.',
   0.00, -600000.00, 'taxation',
   '{"version":1,"city":{"revenue":{"op":"add","value":600000}},"residents":[{"where":{"housing_statuses":["owner"]},"set":{"housing_cost":{"op":"multiply","value":1.03},"government_trust":{"op":"add","value":-0.04}}},{"where":{"neighborhood_names":["Shadyside"],"income_gte":60000},"set":{"happiness":{"op":"add","value":-4}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000004',
   'Fund City Land Bank',
   'Convert vacant lots to affordable housing in Homewood, Hazelwood, and Larimer. Addresses 28% vacancy rate in disinvested neighborhoods.',
   800000.00, 120000.00, 'housing',
   '{"version":1,"city":{"treasury":{"op":"add","value":-800000},"expenses":{"op":"add","value":120000}},"neighborhoods":[{"where":{"names":["Homewood","Hazelwood"]},"set":{"housing_supply":{"op":"add","value":90},"property_value":{"op":"multiply","value":1.03}}}],"residents":[{"where":{"neighborhood_names":["Homewood","Hazelwood"],"housing_statuses":["renter","subsidized"]},"set":{"housing_cost":{"op":"multiply","value":0.96}}},{"where":{"neighborhood_names":["Homewood","Hazelwood"]},"set":{"happiness":{"op":"add","value":5}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000005',
   'Inclusionary Zoning — Lawrenceville',
   'Require 15% affordable units in all new Lawrenceville developments over 10 units. Slows displacement of longtime renters.',
   0.00, 0.00, 'housing',
   '{"version":1,"neighborhoods":[{"where":{"names":["Lawrenceville"]},"set":{"housing_supply":{"op":"add","value":40}}}],"residents":[{"where":{"neighborhood_names":["Lawrenceville"],"housing_statuses":["renter","subsidized"]},"set":{"housing_cost":{"op":"multiply","value":0.95},"happiness":{"op":"add","value":4}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000006',
   'Hillside Stabilization Program',
   'Landslide remediation on steep slopes in Mt. Washington, Beechview, and Brookline. Pittsburgh averages 3+ slope failures per year.',
   1200000.00, 80000.00, 'housing',
   '{"version":1,"city":{"treasury":{"op":"add","value":-1200000},"expenses":{"op":"add","value":80000}},"neighborhoods":[{"where":{"names":["Mount Washington"]},"set":{"property_value":{"op":"multiply","value":1.04}}}],"residents":[{"where":{"neighborhood_names":["Mount Washington"]},"set":{"happiness":{"op":"add","value":4},"government_trust":{"op":"add","value":0.03}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000007',
   'East Busway Frequency Increase',
   'Add peak-hour bus service to Homewood, Hazelwood, and hilltop neighborhoods underserved by current Port Authority schedules.',
   400000.00, 200000.00, 'transit',
   '{"version":1,"city":{"treasury":{"op":"add","value":-400000},"expenses":{"op":"add","value":200000}},"neighborhoods":[{"where":{"names":["Homewood","Hazelwood","Mount Washington"]},"set":{"transit_access":{"op":"add","value":12}}}],"residents":[{"where":{"neighborhood_names":["Homewood","Hazelwood","Mount Washington"]},"set":{"commute_minutes":{"op":"multiply","value":0.9},"happiness":{"op":"add","value":4}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000008',
   'Incline Resident Fare Subsidy',
   'Subsidize Mount Washington incline fares for residents (not tourists). Supports transit-dependent hillside commuters.',
   0.00, 60000.00, 'transit',
   '{"version":1,"city":{"expenses":{"op":"add","value":60000}},"neighborhoods":[{"where":{"names":["Mount Washington"]},"set":{"transit_access":{"op":"add","value":4}}}],"residents":[{"where":{"neighborhood_names":["Mount Washington"]},"set":{"happiness":{"op":"add","value":7}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000009',
   'Light Rail East End Extension',
   'Extend the T light rail across the Allegheny into the East End, connecting Oakland, Shadyside, and East Liberty to downtown.',
   4500000.00, 350000.00, 'transit',
   '{"version":1,"city":{"treasury":{"op":"add","value":-4500000},"expenses":{"op":"add","value":350000}},"neighborhoods":[{"where":{"names":["Oakland","Shadyside","Lawrenceville"]},"set":{"transit_access":{"op":"add","value":18}}},{"where":{"names":["Oakland","Shadyside"]},"set":{"property_value":{"op":"multiply","value":1.08}}}],"residents":[{"where":{"neighborhood_names":["Oakland","Shadyside","Lawrenceville"]},"set":{"commute_minutes":{"op":"multiply","value":0.85}}},{"where":{"neighborhood_names":["Lawrenceville"],"housing_statuses":["renter","subsidized"]},"set":{"housing_cost":{"op":"multiply","value":1.12}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000010',
   'Negotiate PILOT Payments from Universities & Hospitals',
   'Challenge nonprofit property tax exemptions. Secure Payments in Lieu of Taxes from Pitt, CMU, and UPMC — the city''s largest landowners — to fund city services.',
   200000.00, -1800000.00, 'taxation',
   '{"version":1,"city":{"treasury":{"op":"add","value":-200000},"revenue":{"op":"add","value":1800000}},"residents":[{"where":{"neighborhood_names":["Oakland"]},"set":{"government_trust":{"op":"add","value":-0.06}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000011',
   'Land Value Tax Shift',
   'Tax land more heavily than structures — incentivizes development of vacant lots, reduces speculative holding. Pittsburgh used this policy 1913–2001.',
   100000.00, -300000.00, 'taxation',
   '{"version":1,"city":{"treasury":{"op":"add","value":-100000},"revenue":{"op":"add","value":300000}},"neighborhoods":[{"where":{"names":["Homewood","Hazelwood","Hill District"]},"set":{"housing_supply":{"op":"add","value":30},"property_value":{"op":"multiply","value":1.02}}}],"residents":[{"where":{"housing_statuses":["owner"]},"set":{"government_trust":{"op":"add","value":-0.03}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000012',
   'Increase Local Services / Commuter Tax',
   'Raise the tax on suburban workers who use Pittsburgh infrastructure but pay no city income tax. Earned income for non-residents.',
   50000.00, -600000.00, 'taxation',
   '{"version":1,"city":{"treasury":{"op":"add","value":-50000},"revenue":{"op":"add","value":600000}},"residents":[{"where":{"income_gte":80000},"set":{"happiness":{"op":"add","value":-3}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000013',
   'Emergency Bridge Inspection & Repair',
   'Accelerated structural inspection of 446 city bridges and immediate repair of those rated in poor condition.',
   2200000.00, 150000.00, 'safety',
   '{"version":1,"city":{"treasury":{"op":"add","value":-2200000},"expenses":{"op":"add","value":150000}},"residents":[{"set":{"happiness":{"op":"add","value":2},"government_trust":{"op":"add","value":0.02}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000014',
   'Combined Sewer Overflow Remediation',
   'Separate storm and sanitary sewers to stop raw sewage discharge into the Allegheny and Monongahela after heavy rain.',
   3400000.00, 0.00, 'safety',
   '{"version":1,"city":{"treasury":{"op":"add","value":-3400000}},"neighborhoods":[{"set":{"property_value":{"op":"multiply","value":1.01}}}],"residents":[{"set":{"happiness":{"op":"add","value":2}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000015',
   'Robotics & AI Corridor Incentives',
   'Tax abatements and city grants to retain CMU spinoffs in Pittsburgh. Counter the talent drain to Bay Area and NYC.',
   1000000.00, 200000.00, 'employment',
   '{"version":1,"city":{"treasury":{"op":"add","value":-1000000},"expenses":{"op":"add","value":200000},"revenue":{"op":"add","value":450000}},"neighborhoods":[{"where":{"names":["Oakland","Strip District"]},"set":{"jobs":{"op":"add","value":800}}}],"residents":[{"where":{"neighborhood_names":["Oakland","Strip District"],"archetypes":["young_professional","student"]},"set":{"income":{"op":"multiply","value":1.03},"happiness":{"op":"add","value":2}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000016',
   'Butler Street Small Business Grants',
   'Emergency grants to legacy Butler Street businesses facing rent increases due to rapid Lawrenceville gentrification.',
   300000.00, 80000.00, 'employment',
   '{"version":1,"city":{"treasury":{"op":"add","value":-300000},"expenses":{"op":"add","value":80000}},"neighborhoods":[{"where":{"names":["Lawrenceville"]},"set":{"jobs":{"op":"add","value":120}}}],"residents":[{"where":{"neighborhood_names":["Lawrenceville"]},"set":{"happiness":{"op":"add","value":6}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000017',
   'Mon Valley Air Quality Enforcement',
   'Stricter enforcement of air quality standards against industrial emitters in the Monongahela Valley. Improves health outcomes, risks industrial jobs.',
   500000.00, 100000.00, 'environment',
   '{"version":1,"city":{"treasury":{"op":"add","value":-500000},"expenses":{"op":"add","value":100000}},"neighborhoods":[{"where":{"names":["Hazelwood"]},"set":{"jobs":{"op":"add","value":-150}}}],"residents":[{"where":{"neighborhood_names":["Hazelwood","Homewood"]},"set":{"happiness":{"op":"add","value":5}}}]}'::jsonb),

  ('99999999-9999-4999-8999-000000000018',
   'Riverfront Trail & Green Infrastructure',
   'Extend the Three Rivers Heritage Trail, add bioswales and green stormwater infrastructure along riverbanks.',
   1500000.00, 50000.00, 'environment',
   '{"version":1,"city":{"treasury":{"op":"add","value":-1500000},"expenses":{"op":"add","value":50000}},"neighborhoods":[{"where":{"names":["Strip District","South Side Flats","Lawrenceville"]},"set":{"property_value":{"op":"multiply","value":1.02}}}],"residents":[{"set":{"happiness":{"op":"add","value":3}}}]}'::jsonb);

-- Turn-0 snapshot, built FROM the database.
insert into public.simulation_snapshots (id, city_id, turn, state)
select
  '55555555-5555-4555-8555-000000000001'::uuid,
  c.id,
  c.current_turn,
  jsonb_build_object(
    'version', 1,
    'turn',    c.current_turn,
    'city',    to_jsonb(c) - 'created_at' - 'updated_at',
    'neighborhoods', (
      select coalesce(jsonb_agg(to_jsonb(n) order by n.name), '[]'::jsonb)
        from public.neighborhoods n
       where n.city_id = c.id
    ),
    'residents', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.residents r
        join public.neighborhoods n on n.id = r.neighborhood_id
       where n.city_id = c.id
    ),
    -- Nothing has been resolved yet at turn 0.
    'applied_decisions', '[]'::jsonb
  )
from public.cities c
where c.id = '77777777-7777-4777-8777-000000000001'::uuid;

commit;
