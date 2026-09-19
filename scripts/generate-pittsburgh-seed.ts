/**
 * Generates database/supabase/seed_pittsburgh.sql.
 *
 *   npx tsx scripts/generate-pittsburgh-seed.ts
 *
 * Why a generator: the frontend's policy catalogue (lib/mockData.ts) and the
 * database's policy rows must agree on name, description, category and cost —
 * the frontend links the two by policy NAME (lib/backend.ts). Emitting the
 * SQL from the frontend's own list makes drift impossible; the only thing
 * authored here is each policy's machine-readable `effects`.
 *
 * The resident-household generator (md5-hash streams, derived aggregates,
 * turn-0 snapshot) is lifted verbatim from seed.sql so the two seeds can't
 * disagree on how a household is built. Only the `bucket` parameters, ids and
 * city differ.
 *
 * Run after `seed.sql`; it is independent of the Marrow Bay fixtures and safe
 * to re-run (it deletes and recreates its own fixtures by fixed id).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initialNeighborhoods, initialPolicies, initialCity } from '../lib/mockData';
import type { PolicyEffects } from '../database/types/database';
import type { CategoryId } from '../lib/types';

const ROOT = join(__dirname, '..');
const CITY_ID = '77777777-7777-4777-8777-000000000001';
const nid = (n: number) => `88888888-8888-4888-8888-${String(n).padStart(12, '0')}`;
const pid = (n: number) => `99999999-9999-4999-8999-${String(n).padStart(12, '0')}`;
const RESIDENT_PREFIX = '44444444-4444-4444-8445-';
const SNAPSHOT_ID = '55555555-5555-4555-8555-000000000001';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/* ------------------------------------------------------------------ */
/* Neighborhoods + household sample                                    */
/* ------------------------------------------------------------------ */

interface Bucket {
  id: string; // frontend neighborhood id
  households: number;
  incomeBase: number;
  incomeSpan: number;
  rentBase: number;
  ageBase: number;
  ageSpan: number;
  commuteBase: number;
  commuteSpan: number;
  trustBase: number;
  ownerShare: number;
  unempShare: number;
  famSpan: number;
  unhousedShare: number;
  subsidizedShare: number;
  occupations: string[];
}

const HIGHER = ['software_engineer', 'physician', 'finance_analyst', 'attorney', 'professor'];
const MIDDLE = ['nurse', 'teacher', 'logistics_coordinator', 'retail_manager', 'electrician'];
const LOWER = ['retail_associate', 'home_health_aide', 'line_cook', 'rideshare_driver', 'warehouse_picker'];
const CAMPUS = ['research_technician', 'lab_assistant', 'university_staff', 'nurse', 'barista'];

// Household counts are proportional to each neighborhood's frontend population
// (~1 household per 600 people) so the sample keeps the city's shape; the
// adapter rescales population back up (lib/backend.ts). Income/rent bases are
// chosen so the derived averages land near the frontend's medianIncome and
// averageRent; owner share is roughly 1 - renterFraction.
const BUCKETS: Bucket[] = [
  { id: 'shadyside',        households: 22, incomeBase: 80000, incomeSpan: 46000, rentBase: 1840, ageBase: 24, ageSpan: 46, commuteBase: 22, commuteSpan: 16, trustBase: 0.60, ownerShare: 0.30, unempShare: 0.015, famSpan: 2.4, unhousedShare: 0.00, subsidizedShare: 0.02, occupations: HIGHER },
  { id: 'lawrenceville',    households: 14, incomeBase: 44000, incomeSpan: 26000, rentBase: 1430, ageBase: 22, ageSpan: 48, commuteBase: 24, commuteSpan: 18, trustBase: 0.52, ownerShare: 0.20, unempShare: 0.03, famSpan: 2.6, unhousedShare: 0.01, subsidizedShare: 0.05, occupations: MIDDLE },
  { id: 'homewood',         households: 11, incomeBase: 24000, incomeSpan: 14000, rentBase: 690,  ageBase: 20, ageSpan: 56, commuteBase: 34, commuteSpan: 22, trustBase: 0.38, ownerShare: 0.35, unempShare: 0.07, famSpan: 3.6, unhousedShare: 0.04, subsidizedShare: 0.14, occupations: LOWER },
  { id: 'oakland',          households: 42, incomeBase: 34000, incomeSpan: 22000, rentBase: 1500, ageBase: 18, ageSpan: 40, commuteBase: 16, commuteSpan: 14, trustBase: 0.52, ownerShare: 0.08, unempShare: 0.03, famSpan: 2.0, unhousedShare: 0.01, subsidizedShare: 0.05, occupations: CAMPUS },
  { id: 'golden_triangle',  households: 6,  incomeBase: 70000, incomeSpan: 42000, rentBase: 1950, ageBase: 24, ageSpan: 40, commuteBase: 12, commuteSpan: 12, trustBase: 0.60, ownerShare: 0.04, unempShare: 0.015, famSpan: 1.8, unhousedShare: 0.00, subsidizedShare: 0.02, occupations: HIGHER },
  { id: 'mount_washington', households: 13, incomeBase: 41000, incomeSpan: 24000, rentBase: 1100, ageBase: 22, ageSpan: 50, commuteBase: 30, commuteSpan: 20, trustBase: 0.52, ownerShare: 0.45, unempShare: 0.03, famSpan: 2.8, unhousedShare: 0.00, subsidizedShare: 0.05, occupations: MIDDLE },
  { id: 'hill_district',    households: 20, incomeBase: 19000, incomeSpan: 11000, rentBase: 630,  ageBase: 20, ageSpan: 56, commuteBase: 32, commuteSpan: 22, trustBase: 0.36, ownerShare: 0.30, unempShare: 0.07, famSpan: 3.6, unhousedShare: 0.04, subsidizedShare: 0.14, occupations: LOWER },
  { id: 'strip_district',   households: 5,  incomeBase: 52000, incomeSpan: 30000, rentBase: 1650, ageBase: 22, ageSpan: 44, commuteBase: 20, commuteSpan: 16, trustBase: 0.52, ownerShare: 0.10, unempShare: 0.03, famSpan: 2.2, unhousedShare: 0.00, subsidizedShare: 0.05, occupations: MIDDLE },
  { id: 'south_side_flats', households: 18, incomeBase: 38000, incomeSpan: 22000, rentBase: 1160, ageBase: 20, ageSpan: 46, commuteBase: 22, commuteSpan: 18, trustBase: 0.52, ownerShare: 0.22, unempShare: 0.03, famSpan: 2.4, unhousedShare: 0.01, subsidizedShare: 0.05, occupations: MIDDLE },
  { id: 'hazelwood',        households: 8,  incomeBase: 22000, incomeSpan: 13000, rentBase: 700,  ageBase: 20, ageSpan: 56, commuteBase: 34, commuteSpan: 22, trustBase: 0.38, ownerShare: 0.40, unempShare: 0.06, famSpan: 3.4, unhousedShare: 0.03, subsidizedShare: 0.14, occupations: LOWER },
];

const HOUSEHOLD_COUNT = BUCKETS.reduce((n, b) => n + b.households, 0);
const nbById = new Map(initialNeighborhoods.map((n) => [n.id, n]));
const nameOf = (id: string) => {
  const n = nbById.get(id);
  if (!n) throw new Error(`Unknown frontend neighborhood id ${id}`);
  return n.name;
};

/* ------------------------------------------------------------------ */
/* Policy effects (the only hand-authored simulation content)          */
/* ------------------------------------------------------------------ */

const add = (value: number) => ({ op: 'add' as const, value });
const mul = (value: number) => ({ op: 'multiply' as const, value });

/**
 * The engine debits nothing automatically (see README "Known limitations"),
 * so each policy's money movement is spelled out as a city effect: the
 * upfront cost comes out of treasury, and a recurring cost/saving shifts
 * expenses/revenue permanently.
 */
function money(upfront: number, recurring: number): NonNullable<PolicyEffects['city']> {
  const city: NonNullable<PolicyEffects['city']> = {};
  if (upfront > 0) city.treasury = add(-upfront);
  if (recurring > 0) city.expenses = add(recurring);
  if (recurring < 0) city.revenue = add(-recurring);
  return city;
}

type Extra = Pick<PolicyEffects, 'neighborhoods' | 'residents'> & { revenue?: number };

const N = (...ids: string[]) => ids.map(nameOf);
const RENTERS = ['renter', 'subsidized'] as const;

const EXTRAS: Record<string, Extra> = {
  'pol-build-affordable-housing': {
    neighborhoods: [{ where: { names: N('homewood') }, set: { housing_supply: add(180) } }],
    residents: [
      { where: { neighborhood_names: N('homewood'), housing_statuses: [...RENTERS] }, set: { housing_cost: mul(0.94) } },
      { where: { neighborhood_names: N('homewood') }, set: { happiness: add(8) } },
    ],
  },
  'pol-expand-transit': {
    neighborhoods: [
      { set: { transit_access: add(8) } },
      { where: { names: N('homewood', 'lawrenceville') }, set: { transit_access: add(6) } },
    ],
    residents: [
      { where: { income_lt: 60000 }, set: { commute_minutes: mul(0.92) } },
      { set: { happiness: add(3) } },
    ],
  },
  'pol-raise-property-tax': {
    residents: [
      { where: { housing_statuses: ['owner'] }, set: { housing_cost: mul(1.03), government_trust: add(-0.04) } },
      { where: { neighborhood_names: N('shadyside'), income_gte: 60000 }, set: { happiness: add(-4) } },
    ],
  },
  'pol-landbank': {
    neighborhoods: [
      { where: { names: N('homewood', 'hazelwood') }, set: { housing_supply: add(90), property_value: mul(1.03) } },
    ],
    residents: [
      { where: { neighborhood_names: N('homewood', 'hazelwood'), housing_statuses: [...RENTERS] }, set: { housing_cost: mul(0.96) } },
      { where: { neighborhood_names: N('homewood', 'hazelwood') }, set: { happiness: add(5) } },
    ],
  },
  'pol-inclusionary-zoning': {
    neighborhoods: [{ where: { names: N('lawrenceville') }, set: { housing_supply: add(40) } }],
    residents: [
      { where: { neighborhood_names: N('lawrenceville'), housing_statuses: [...RENTERS] }, set: { housing_cost: mul(0.95), happiness: add(4) } },
    ],
  },
  'pol-hillside-stabilization': {
    neighborhoods: [{ where: { names: N('mount_washington') }, set: { property_value: mul(1.04) } }],
    residents: [{ where: { neighborhood_names: N('mount_washington') }, set: { happiness: add(4), government_trust: add(0.03) } }],
  },
  'pol-busway-extension': {
    neighborhoods: [{ where: { names: N('homewood', 'hazelwood', 'mount_washington') }, set: { transit_access: add(12) } }],
    residents: [
      { where: { neighborhood_names: N('homewood', 'hazelwood', 'mount_washington') }, set: { commute_minutes: mul(0.9), happiness: add(4) } },
    ],
  },
  'pol-incline-subsidy': {
    neighborhoods: [{ where: { names: N('mount_washington') }, set: { transit_access: add(4) } }],
    residents: [{ where: { neighborhood_names: N('mount_washington') }, set: { happiness: add(7) } }],
  },
  'pol-light-rail-east': {
    neighborhoods: [
      { where: { names: N('oakland', 'shadyside', 'lawrenceville') }, set: { transit_access: add(18) } },
      { where: { names: N('oakland', 'shadyside') }, set: { property_value: mul(1.08) } },
    ],
    residents: [
      { where: { neighborhood_names: N('oakland', 'shadyside', 'lawrenceville') }, set: { commute_minutes: mul(0.85) } },
      { where: { neighborhood_names: N('lawrenceville'), housing_statuses: [...RENTERS] }, set: { housing_cost: mul(1.12) } },
    ],
  },
  'pol-pilot-payments': {
    residents: [{ where: { neighborhood_names: N('oakland') }, set: { government_trust: add(-0.06) } }],
  },
  'pol-land-value-tax': {
    neighborhoods: [
      { where: { names: N('homewood', 'hazelwood', 'hill_district') }, set: { housing_supply: add(30), property_value: mul(1.02) } },
    ],
    residents: [{ where: { housing_statuses: ['owner'] }, set: { government_trust: add(-0.03) } }],
  },
  'pol-commuter-tax': {
    residents: [{ where: { income_gte: 80000 }, set: { happiness: add(-3) } }],
  },
  'pol-bridge-inspection': {
    residents: [{ set: { happiness: add(2), government_trust: add(0.02) } }],
  },
  'pol-sewer-overflow': {
    neighborhoods: [{ set: { property_value: mul(1.01) } }],
    residents: [{ set: { happiness: add(2) } }],
  },
  'pol-robotics-corridor': {
    revenue: 450000,
    neighborhoods: [{ where: { names: N('oakland', 'strip_district') }, set: { jobs: add(800) } }],
    residents: [
      { where: { neighborhood_names: N('oakland', 'strip_district'), archetypes: ['young_professional', 'student'] }, set: { income: mul(1.03), happiness: add(2) } },
    ],
  },
  'pol-butler-street-grants': {
    neighborhoods: [{ where: { names: N('lawrenceville') }, set: { jobs: add(120) } }],
    residents: [{ where: { neighborhood_names: N('lawrenceville') }, set: { happiness: add(6) } }],
  },
  'pol-air-quality': {
    neighborhoods: [{ where: { names: N('hazelwood') }, set: { jobs: add(-150) } }],
    residents: [{ where: { neighborhood_names: N('hazelwood', 'homewood') }, set: { happiness: add(5) } }],
  },
  'pol-riverfront-trails': {
    neighborhoods: [
      { where: { names: N('strip_district', 'south_side_flats', 'lawrenceville') }, set: { property_value: mul(1.02) } },
    ],
    residents: [{ set: { happiness: add(3) } }],
  },
};

// Frontend category -> database policy_category.
const CATEGORY_MAP: Record<CategoryId, string> = {
  housing: 'housing',
  transit: 'transit',
  taxes: 'taxation',
  safety: 'safety',
  business: 'employment',
  environment: 'environment',
};

/* ------------------------------------------------------------------ */
/* SQL assembly                                                        */
/* ------------------------------------------------------------------ */

const seed = readFileSync(join(ROOT, 'database/supabase/seed.sql'), 'utf8').replace(/\r\n/g, '\n');

function slice(from: string, to: string, includeTo = false): string {
  const a = seed.indexOf(from);
  const b = seed.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`seed.sql markers not found: ${from} .. ${to}`);
  return seed.slice(a, includeTo ? b + to.length : b);
}

// `idx` CTE through the final `insert into public.residents ... order by i;`
const residentPipeline = slice('idx as (', 'order by i;', true)
  .replace('generate_series(1, 100)', `generate_series(1, ${HOUSEHOLD_COUNT})`)
  .replace(/n\.city_id = '11111111-1111-4111-8111-111111111111'::uuid/g, `n.city_id = '${CITY_ID}'::uuid`)
  .replace("('44444444-4444-4444-8444-' ||", `('${RESIDENT_PREFIX}' ||`);

if (!residentPipeline.includes(RESIDENT_PREFIX) || !residentPipeline.includes(`generate_series(1, ${HOUSEHOLD_COUNT})`)) {
  throw new Error('seed.sql resident pipeline no longer matches the expected shape; update the generator');
}

const snapshotBlock = slice('insert into public.simulation_snapshots', 'commit;')
  .replace("'55555555-5555-4555-8555-000000000000'::uuid", `'${SNAPSHOT_ID}'::uuid`)
  .replace(/where c\.id = '11111111-1111-4111-8111-111111111111'::uuid;/, `where c.id = '${CITY_ID}'::uuid;`);

const aggregateBlock = slice('update public.neighborhoods n', '-- -----------------------------------------------------------------------------\n-- 6. Policy catalogue')
  .replace(/'11111111-1111-4111-8111-111111111111'::uuid/g, `'${CITY_ID}'::uuid`);

let start = 1;
const bucketRows = BUCKETS.map((b) => {
  const lo = start;
  const hi = start + b.households - 1;
  start = hi + 1;
  const occ = `array[${b.occupations.map(q).join(',')}]::text[]`;
  const cast = (v: number) => `${v}::numeric`;
  return `    (${q(nameOf(b.id))}, ${lo}, ${hi}, ${cast(b.incomeBase)}, ${cast(b.incomeSpan)}, ${cast(b.rentBase)}, ${b.ageBase}, ${b.ageSpan}, ${b.commuteBase}, ${b.commuteSpan}, ${cast(b.trustBase)}, ${cast(b.ownerShare)}, ${cast(b.unempShare)}, ${cast(b.famSpan)}, ${cast(b.unhousedShare)}, ${cast(b.subsidizedShare)}, ${occ})`;
}).join(',\n');

const neighborhoodRows = BUCKETS.map((b, i) => {
  const n = nbById.get(b.id)!;
  return `  ('${nid(i + 1)}', '${CITY_ID}', ${q(n.name)}, ${n.propertyValue}.00, ${n.housingUnits}, ${n.jobs}, ${n.transitAccess}.00)`;
}).join(',\n');

const policyRows = initialPolicies.map((p, i) => {
  const extra = EXTRAS[p.id];
  if (!extra) throw new Error(`No effects authored for frontend policy ${p.id}`);
  const city = money(p.upfrontCost, p.recurringCost);
  if (extra.revenue) city.revenue = add((city.revenue?.value ?? 0) + extra.revenue);
  const effects: PolicyEffects = {
    version: 1,
    ...(Object.keys(city).length ? { city } : {}),
    ...(extra.neighborhoods ? { neighborhoods: extra.neighborhoods } : {}),
    ...(extra.residents ? { residents: extra.residents } : {}),
  };
  return `  ('${pid(i + 1)}',\n   ${q(p.name)},\n   ${q(p.description)},\n   ${p.upfrontCost}.00, ${p.recurringCost}.00, '${CATEGORY_MAP[p.category]}',\n   ${q(JSON.stringify(effects))}::jsonb)`;
}).join(',\n\n');

const policyIds = initialPolicies.map((_, i) => `   '${pid(i + 1)}'::uuid`).join(',\n');

const out = `-- =============================================================================
-- State of Us — Pittsburgh seed  (GENERATED — do not edit by hand)
--
--   npx tsx scripts/generate-pittsburgh-seed.ts
--
-- Creates: 1 city (Pittsburgh), ${BUCKETS.length} neighborhoods, ${HOUSEHOLD_COUNT} resident households,
--          ${initialPolicies.length} catalogue policies, 1 turn-0 snapshot.
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
delete from public.cities where id = '${CITY_ID}'::uuid;

delete from public.policies
 where id in (
${policyIds}
 );

-- Fiscal figures come from the frontend's opening state. No debt is modelled
-- on the frontend side, so none is invented here.
insert into public.cities
  (id, name, current_turn, treasury, revenue, expenses, debt)
values
  ('${CITY_ID}', 'Pittsburgh', 0,
   ${initialCity.treasury}.00, ${initialCity.revenue}.00, ${initialCity.expenses}.00, 0.00);

insert into public.neighborhoods
  (id, city_id, name, property_value, housing_supply, jobs, transit_access)
values
${neighborhoodRows};

-- Households: ${HOUSEHOLD_COUNT} rows, proportional to each neighborhood's frontend population.
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
${bucketRows}
),

${residentPipeline}

-- Derived aggregates, from the residents just inserted.
${aggregateBlock}-- Policy catalogue: ${initialPolicies.length} policies, same list as the frontend.
insert into public.policies
  (id, name, description, upfront_cost, recurring_cost, category, effects)
values
${policyRows};

-- Turn-0 snapshot, built FROM the database.
${snapshotBlock}commit;
`;

writeFileSync(join(ROOT, 'database/supabase/seed_pittsburgh.sql'), out);
console.log(`wrote database/supabase/seed_pittsburgh.sql (${HOUSEHOLD_COUNT} households, ${initialPolicies.length} policies)`);
