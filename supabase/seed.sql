-- =============================================================================
-- State of Us — seed data
--
-- Creates: 1 city (Marrow Bay), 4 neighborhoods, 100 resident households,
--          6 catalogue policies, 1 example decision, 1 turn-0 snapshot.
--
-- DETERMINISM
--   No random(), no now() in any simulated value, no gen_random_uuid().
--   Every id is fixed and every resident attribute comes from a Knuth
--   multiplicative hash of the row index, so `supabase db reset` produces a
--   byte-identical database every time. That is a hard requirement: the
--   engine's reproducibility tests diff against this seed.
--
--   hash(i, salt) = first 28 bits of md5(i || ':' || salt), scaled to [0, 1).
--   md5 (not a multiplicative hash) because the streams must be mutually
--   INDEPENDENT — see the note on the `base` CTE below.
--
-- DERIVED-BY-CONSTRUCTION
--   Neighborhood and city aggregates are NOT hand-typed. Residents are
--   inserted first, then aggregates are computed from them with UPDATE ... FROM.
--   Editing a resident and re-running the seed keeps everything consistent.
--
-- Safe to re-run: deletes its own fixtures first (by fixed id).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Reset this seed's fixtures
-- -----------------------------------------------------------------------------
-- City first: cascades to neighborhoods -> residents, and to decisions. Only
-- then can the policies be removed (decisions.policy_id is ON DELETE RESTRICT).
delete from public.cities
 where id = '11111111-1111-4111-8111-111111111111'::uuid;

delete from public.policies
 where id in (
   '33333333-3333-4333-8333-000000000001'::uuid,
   '33333333-3333-4333-8333-000000000002'::uuid,
   '33333333-3333-4333-8333-000000000003'::uuid,
   '33333333-3333-4333-8333-000000000004'::uuid,
   '33333333-3333-4333-8333-000000000005'::uuid,
   '33333333-3333-4333-8333-000000000006'::uuid
 );

-- -----------------------------------------------------------------------------
-- 1. City
-- -----------------------------------------------------------------------------
-- Fiscal figures are authored (they are not derivable from residents).
-- Scale check: ~260 people, ~$1.69M annual revenue ≈ $6.5k/capita, which is in
-- the normal range for a small municipality.
-- happiness / approval / unemployment / population / average_rent are placeholders
-- here and get overwritten from the resident rows in step 5.
insert into public.cities
  (id, name, current_turn, treasury, revenue, expenses, debt)
values
  ('11111111-1111-4111-8111-111111111111', 'Marrow Bay', 0,
   1240000.00, 1690000.00, 1604000.00, 4350000.00);

-- -----------------------------------------------------------------------------
-- 2. Neighborhoods
-- -----------------------------------------------------------------------------
-- Four deliberately different pressure profiles so policies have something to
-- trade off against:
--   Harbor Point  — wealthy, transit-rich, supply-starved, expensive
--   Mill District — working class, mid transit, in transition
--   Eastbrook     — suburban, car-dependent, family-heavy, owner-occupied
--   Kestrel Flats — low income, poor transit, cheap, high unemployment
insert into public.neighborhoods
  (id, city_id, name, property_value, housing_supply, jobs, transit_access)
values
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-111111111111',
   'Harbor Point',   780000.00, 24, 61, 88.00),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-111111111111',
   'Mill District',  385000.00, 33, 38, 64.00),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-111111111111',
   'Eastbrook',      452000.00, 28, 22, 31.00),
  ('22222222-2222-4222-8222-000000000004', '11111111-1111-4111-8111-111111111111',
   'Kestrel Flats',  236000.00, 23, 12, 34.00);

-- -----------------------------------------------------------------------------
-- 3. Residents (100 households)
-- -----------------------------------------------------------------------------
-- Index ranges fix the per-neighborhood household counts:
--   1-22 Harbor Point | 23-52 Mill District | 53-78 Eastbrook | 79-100 Kestrel Flats
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
    ('Harbor Point',   1,  22,
     118000::numeric, 62000::numeric,
     3150::numeric,
     24, 44,
     14, 16,
     0.62::numeric, 0.34::numeric, 0.03::numeric, 2.4::numeric,
     0.00::numeric, 0.02::numeric,
     array['software_engineer','physician','finance_analyst','attorney','professor']::text[]),

    ('Mill District', 23,  52,
     64000, 28000,
     1950,
     20, 50,
     28, 22,
     0.44, 0.21, 0.08, 3.2,
     0.02, 0.06,
     array['nurse','machinist','teacher','logistics_coordinator','retail_manager']),

    ('Eastbrook',     53,  78,
     86000, 34000,
     2350,
     26, 46,
     44, 24,
     0.55, 0.63, 0.05, 4.6,
     0.00, 0.03,
     array['teacher','civil_servant','electrician','accountant','sales_representative']),

    ('Kestrel Flats', 79, 100,
     41000, 22000,
     1420,
     19, 54,
     38, 26,
     0.29, 0.11, 0.15, 3.6,
     0.07, 0.18,
     array['retail_associate','home_health_aide','line_cook','rideshare_driver','warehouse_picker'])
),

idx as (
  select generate_series(1, 100) as i
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
    on n.city_id = '11111111-1111-4111-8111-111111111111'::uuid
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
  ('44444444-4444-4444-8444-' || lpad(i::text, 12, '0'))::uuid,
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

-- -----------------------------------------------------------------------------
-- 4. Derive neighborhood aggregates from the residents just inserted
-- -----------------------------------------------------------------------------
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
   and n.city_id = '11111111-1111-4111-8111-111111111111'::uuid;

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
    where n.city_id = '11111111-1111-4111-8111-111111111111'::uuid
  ) agg
 where c.id = '11111111-1111-4111-8111-111111111111'::uuid;

-- -----------------------------------------------------------------------------
-- 6. Policy catalogue
-- -----------------------------------------------------------------------------
-- Not strictly requested, but decisions and snapshots are untestable without a
-- catalogue, and these double as worked examples of the `effects` contract.
-- Costs are scaled to Marrow Bay's ~$1.69M annual revenue.
insert into public.policies
  (id, name, description, upfront_cost, recurring_cost, category, effects)
values
  ('33333333-3333-4333-8333-000000000001',
   'Inclusionary Zoning Overlay',
   'Requires 15% affordable units in new developments over 10 units. Adds supply in high-value areas but slows private construction.',
   180000.00, 45000.00, 'housing',
   '{
      "version": 1,
      "ramp_turns": 2,
      "neighborhoods": [
        {
          "where": { "average_income_gte": 70000 },
          "set": {
            "housing_supply": { "op": "add", "value": 3 },
            "property_value": { "op": "multiply", "value": 0.985 }
          }
        }
      ],
      "residents": [
        {
          "where": { "housing_statuses": ["renter", "subsidized"] },
          "set": { "housing_cost": { "op": "multiply", "value": 0.97 } }
        }
      ]
    }'::jsonb),

  ('33333333-3333-4333-8333-000000000002',
   'Crosstown Bus Rapid Transit',
   'Dedicated bus lanes linking Kestrel Flats and Eastbrook to the Harbor Point job core.',
   2400000.00, 320000.00, 'transit',
   '{
      "version": 1,
      "ramp_turns": 3,
      "neighborhoods": [
        {
          "where": { "transit_access_lt": 65 },
          "set": { "transit_access": { "op": "add", "value": 18 } }
        }
      ],
      "residents": [
        {
          "where": { "income_lt": 70000 },
          "set": { "commute_minutes": { "op": "multiply", "value": 0.82 } }
        }
      ]
    }'::jsonb),

  ('33333333-3333-4333-8333-000000000003',
   'Property Tax Increase (0.4%)',
   'Raises the municipal property tax rate by 0.4 percentage points. Closes the operating gap; owners notice immediately.',
   0.00, -260000.00, 'taxation',
   '{
      "version": 1,
      "ramp_turns": 0,
      "city": { "revenue": { "op": "add", "value": 260000 } },
      "residents": [
        {
          "where": { "housing_statuses": ["owner"] },
          "set": {
            "housing_cost":     { "op": "multiply", "value": 1.04 },
            "government_trust": { "op": "add", "value": -0.05 }
          }
        }
      ]
    }'::jsonb),

  ('33333333-3333-4333-8333-000000000004',
   'Rental Assistance Program',
   'Direct monthly vouchers for households spending over 40% of income on rent.',
   90000.00, 410000.00, 'housing',
   '{
      "version": 1,
      "ramp_turns": 1,
      "residents": [
        {
          "where": { "housing_statuses": ["renter"], "income_lt": 55000 },
          "set": {
            "housing_cost":     { "op": "multiply", "value": 0.78 },
            "government_trust": { "op": "add", "value": 0.06 }
          }
        }
      ]
    }'::jsonb),

  ('33333333-3333-4333-8333-000000000005',
   'Small Business Grant Fund',
   'Matching grants for storefront businesses in Mill District and Kestrel Flats.',
   350000.00, 120000.00, 'employment',
   '{
      "version": 1,
      "ramp_turns": 2,
      "neighborhoods": [
        {
          "where": { "names": ["Mill District", "Kestrel Flats"] },
          "set": { "jobs": { "op": "add", "value": 6 } }
        }
      ],
      "city": { "unemployment": { "op": "add", "value": -1.2 } }
    }'::jsonb),

  ('33333333-3333-4333-8333-000000000006',
   'Parks & Green Corridor Expansion',
   'Converts the disused rail spur into a linear park running the length of the city.',
   620000.00, 85000.00, 'environment',
   '{
      "version": 1,
      "ramp_turns": 2,
      "neighborhoods": [
        {
          "where": {},
          "set": {
            "happiness":      { "op": "add", "value": 2.5 },
            "property_value": { "op": "multiply", "value": 1.015 }
          }
        }
      ]
    }'::jsonb);

-- -----------------------------------------------------------------------------
-- 7. Example decision (queued against turn 0, resolves when turn 0 is run)
-- -----------------------------------------------------------------------------
insert into public.decisions
  (id, city_id, policy_id, turn, player_reasoning)
values
  ('66666666-6666-4666-8666-000000000001',
   '11111111-1111-4111-8111-111111111111',
   '33333333-3333-4333-8333-000000000004',
   0,
   'Kestrel Flats renters are past 60% rent burden and their trust is bottoming out. Vouchers are the fastest lever; BRT is the better structural fix but it will not land for three turns.');

-- -----------------------------------------------------------------------------
-- 8. Turn-0 snapshot, built FROM the database
-- -----------------------------------------------------------------------------
-- Read back from the tables rather than restating literals, so the snapshot can
-- never drift from the rows it claims to describe.
-- Convention: snapshot(turn = N) is the state at the START of turn N, before
-- any decision recorded at turn N has been applied.
insert into public.simulation_snapshots (id, city_id, turn, state)
select
  '55555555-5555-4555-8555-000000000000'::uuid,
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
where c.id = '11111111-1111-4111-8111-111111111111'::uuid;

commit;

-- -----------------------------------------------------------------------------
-- Sanity checks (run manually after seeding)
-- -----------------------------------------------------------------------------
-- select count(*) from public.residents;                        -- 100
-- select name, population, average_income, average_rent, happiness
--   from public.neighborhoods order by name;
-- select population, happiness, approval, unemployment, average_rent
--   from public.cities;
-- select archetype, count(*) from public.residents group by 1 order by 2 desc;
-- select housing_status, count(*) from public.residents group by 1 order by 2 desc;
