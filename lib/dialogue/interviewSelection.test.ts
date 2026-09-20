import { describe, expect, it } from 'vitest';
import type { Neighborhood, Resident } from '../../database/types/database';
import { interviewImpact, pickRandomInterviewees, selectInterviewees } from './interviewSelection';
const person = (id: string, district: string, score: number, mood = 'uncertain') => ({ resident: { id, neighborhood_id: district, age: 30, income: 40000, housing_status: 'renter', archetype: 'service_worker' } as Resident, score, mood });
it('selects only two unique residents from different districts', () => {
  const a = person('a', 'Homewood', 20, 'hopeful');
  const b = person('b', 'Homewood', -20, 'upset');
  const c = person('c', 'Downtown', -5, 'upset');
  expect(selectInterviewees([a, a, b, c]).map(p => p.resident.id)).toEqual(['a', 'c']);
});
it('caps even a small slate at two', () => {
  expect(selectInterviewees([person('a','one',0),person('b','two',0),person('c','three',0)])).toHaveLength(2);
});
it('never repeats a resident when only one is available', () => {
  const a = person('a','one',0);
  expect(selectInterviewees([a,a])).toHaveLength(1);
});
it('uses 30 different people across a 15-day run', () => {
  const residents = Array.from({ length: 60 }, (_, i) => person(
    String(i), ['Homewood', 'Oakland', 'Downtown', 'Shadyside'][i % 4],
    i % 2 ? -10 : 10, i % 2 ? 'upset' : 'hopeful'));
  const used = new Set<string>();
  for (let day = 0; day < 15; day++) {
    const picked = selectInterviewees(residents, used);
    expect(picked).toHaveLength(2);
    expect(picked[0].resident.neighborhood_id).not.toBe(picked[1].resident.neighborhood_id);
    for (const p of picked) {
      expect(used.has(p.resident.id)).toBe(false);
      used.add(p.resident.id);
    }
  }
  expect(used.size).toBe(30);
});
it('does not reuse an interviewed person when the eligible pool is exhausted', () => {
  expect(selectInterviewees([person('a','one',10)], new Set(['a']))).toEqual([]);
});

const household: Resident = {
  id: 'h', neighborhood_id: 'n', age: 40, income: 60000, occupation: 'teacher', housing_status: 'renter', housing_cost: 1500,
  commute_minutes: 30, family_size: 2, tax_sensitivity: 0.5, housing_sensitivity: 0.5, transit_sensitivity: 0.9,
  government_trust: 0.5, happiness: 60, archetype: 'mid_career_renter',
};
const district: Neighborhood = { id: 'n', city_id: 'c', name: 'Homewood', population: 100, average_income: 50000, average_rent: 1200, happiness: 60, property_value: 100000, housing_supply: 100, jobs: 50, transit_access: 50 };

it('gives the concrete effect of the chosen option as the reason, not a generic one', () => {
  // A transit plan also nudges everyone's happiness up a little; the shorter commute is what this person cares about.
  const after = { ...household, commute_minutes: 26, happiness: 63 };
  const { reason, mood } = interviewImpact(household, after, district, { ...district, transit_access: 58 });
  expect(mood).toBe('hopeful');
  expect(reason).toMatch(/commute|transit access/);
  expect(reason).not.toMatch(/households like mine|disruption/);
});

it('reacts to a cost rise for an owner and stays neutral for a renter of the same plan', () => {
  const owner = { ...household, housing_status: 'owner' as const };
  expect(interviewImpact(owner, { ...owner, housing_cost: 1540 }, district, district).reason).toMatch(/higher housing costs/);
  expect(interviewImpact(household, household, district, district).mood).toBe('uncertain');
});

it('still explains a response that only moves wellbeing and trust (an emergency) without blaming the wrong thing', () => {
  const helped = interviewImpact(household, { ...household, happiness: 66, government_trust: 0.6 }, district, district);
  expect(helped.mood).toBe('hopeful');
  expect(helped.reason).toMatch(/city’s response|responding to people/);
  const hurt = interviewImpact(household, { ...household, happiness: 52 }, district, district);
  expect(hurt.mood).toBe('upset');
  expect(hurt.reason).toMatch(/worse off/);
});

describe('random interviewees', () => {
  const at = (id: string, district: string) => ({ resident: { id, neighborhood_id: district } });
  const crowd = Array.from({ length: 40 }, (_, i) => at(`p${i}`, ['Homewood', 'Shadyside', 'Lawrenceville', 'Golden Triangle'][i % 4]));
  // A small deterministic random source, so the tests never flake.
  const seeded = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  it('picks exactly two different people, from different districts', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const [a, b] = pickRandomInterviewees(crowd, new Set(), seeded(seed));
      expect(a.resident.id).not.toBe(b.resident.id);
      expect(a.resident.neighborhood_id).not.toBe(b.resident.neighborhood_id);
    }
  });

  it('really is random: over many days it reaches (nearly) everyone, not just the most affected', () => {
    const seen = new Set<string>();
    const random = seeded(7);
    for (let day = 0; day < 200; day++) for (const p of pickRandomInterviewees(crowd, new Set(), random)) seen.add(p.resident.id);
    expect(seen.size).toBeGreaterThanOrEqual(38);
  });

  it('is not influenced by how affected people are', () => {
    const scored = crowd.map((p, i) => ({ ...p, score: i === 0 ? 1000 : 0, mood: 'uncertain' }));
    const picks = new Set<string>();
    const random = seeded(3);
    for (let day = 0; day < 100; day++) for (const p of pickRandomInterviewees(scored, new Set(), random)) picks.add(p.resident.id);
    expect(picks.size).toBeGreaterThan(30);
  });

  it('never repeats anyone interviewed on another day', () => {
    const used = new Set<string>();
    const random = seeded(11);
    for (let day = 0; day < 20; day++) {
      const picked = pickRandomInterviewees(crowd, used, random);
      expect(picked).toHaveLength(2);
      for (const p of picked) { expect(used.has(p.resident.id)).toBe(false); used.add(p.resident.id); }
    }
    expect(used.size).toBe(40);
  });

  it('uses the injected random source (0 -> first eligible, ~1 -> last eligible)', () => {
    expect(pickRandomInterviewees(crowd, new Set(), () => 0)[0].resident.id).toBe('p0');
    expect(pickRandomInterviewees(crowd, new Set(), () => 0.9999)[0].resident.id).toBe('p39');
  });

  it('falls back to the same district when only one district is left, and returns fewer than two when the pool runs out', () => {
    const oneDistrict = [at('a', 'Homewood'), at('b', 'Homewood'), at('c', 'Homewood')];
    expect(pickRandomInterviewees(oneDistrict, new Set(), seeded(5))).toHaveLength(2);
    expect(pickRandomInterviewees(crowd, new Set(crowd.slice(1).map(p => p.resident.id)))).toHaveLength(1);
    expect(pickRandomInterviewees([at('a', 'x'), at('a', 'x')])).toHaveLength(1);
  });
});
