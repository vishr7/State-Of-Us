import type { Resident, Neighborhood } from '../../database/types/database';
export function interviewImpact(before: Resident, after: Resident, district: Neighborhood, nextDistrict: Neighborhood) {
  const factors = [
    // General wellbeing. Weighted low so a concrete effect of the chosen option (commute, housing cost, transit access...)
    // is the reason a person gives when there is one; it leads only when little else moved (e.g. an emergency response).
    { score: (after.happiness - before.happiness) * 0.3, benefit: 'the city’s response would make things easier for households like mine', harm: 'the city’s response would leave households like mine worse off' },
    { score: (after.government_trust - before.government_trust) * 20, benefit: 'the city is responding to people in our situation', harm: 'the response makes me feel that people in our situation are being overlooked' },
    { score: (before.housing_cost - after.housing_cost) / Math.max(before.income / 12, 1) * 100, benefit: 'lower housing costs would leave more room in my household budget', harm: 'higher housing costs would squeeze my household budget' },
    { score: (after.income - before.income) / Math.max(before.income, 1) * 100, benefit: 'higher income would give my household more breathing room', harm: 'losing income would make it harder to cover our bills' },
    { score: (before.commute_minutes - after.commute_minutes) * before.transit_sensitivity, benefit: 'a shorter commute would give me more time back', harm: 'a longer commute would take more time out of my day' },
    { score: (nextDistrict.transit_access - district.transit_access) * before.transit_sensitivity, benefit: 'better local transit access would help our neighborhood', harm: 'reduced local transit access would make getting around harder' },
    { score: (nextDistrict.housing_supply - district.housing_supply) * before.housing_sensitivity * .1, benefit: 'more local housing would give the neighborhood more options', harm: 'fewer homes locally would leave the neighborhood with fewer options' },
  ];
  const positive = factors.filter(f => f.score > 0).sort((a,b) => b.score - a.score);
  const negative = factors.filter(f => f.score < 0).sort((a,b) => a.score - b.score);
  const mood = positive.length && negative.length ? 'mixed' : positive.length ? 'hopeful' : negative.length ? 'upset' : 'uncertain';
  const reason = mood === 'mixed' ? `I have mixed feelings: ${positive[0].benefit}, but ${negative[0].harm}.` : mood === 'hopeful' ? `I’m happy about this plan because ${positive[0].benefit}.` : mood === 'upset' ? `I’m upset about this plan because ${negative[0].harm}.` : 'I’m not convinced yet. The projections don’t show a direct change to my household bills or commute, so I want to understand what we get for the city’s spending.';
  return { score: factors.reduce((sum,f) => sum + f.score, 0), mood, reason };
}
export function selectInterviewees<T extends { resident: Resident; score: number; mood: string }>(people: T[], excluded: ReadonlySet<string> = new Set()): T[] {
  const unique = [...new Map(people.filter(p => !excluded.has(p.resident.id)).map(p => [p.resident.id, p])).values()];
  if (unique.length < 2) return unique;
  const sorted = unique.sort((a,b) => Math.abs(b.score) - Math.abs(a.score) || a.resident.id.localeCompare(b.resident.id));
  const first = sorted[0];
  const otherDistricts = sorted.filter(p => p.resident.neighborhood_id !== first.resident.neighborhood_id);
  const pool = otherDistricts.length ? otherDistricts : sorted.slice(1);
  const diversity = (p: T) => Number(p.resident.housing_status !== first.resident.housing_status)
    + Number(p.resident.archetype !== first.resident.archetype)
    + Number(Math.floor(p.resident.age / 20) !== Math.floor(first.resident.age / 20))
    + Number(Math.floor(p.resident.income / 30000) !== Math.floor(first.resident.income / 30000));
  pool.sort((a,b) => Number(b.mood !== first.mood) - Number(a.mood !== first.mood)
    || diversity(b) - diversity(a) || Math.abs(b.score - first.score) - Math.abs(a.score - first.score)
    || a.resident.id.localeCompare(b.resident.id));
  return [first, pool[0]];
}

/**
 * The anchor's pick for the day: two residents chosen AT RANDOM, from different districts when possible,
 * never anyone already interviewed on another day. (Unlike selectInterviewees, this does not favour the most
 * affected people: the anchor is talking to ordinary residents, some barely touched by today's option.)
 * `random` is injectable so the pick is testable.
 */
export function pickRandomInterviewees<T extends { resident: Pick<Resident, 'id' | 'neighborhood_id'> }>(
  people: T[],
  excluded: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
): T[] {
  const pool = [...new Map(people.filter(p => !excluded.has(p.resident.id)).map(p => [p.resident.id, p])).values()];
  if (pool.length < 2) return pool;
  const choose = (from: T[]) => from[Math.min(from.length - 1, Math.floor(random() * from.length))];
  const first = choose(pool);
  const others = pool.filter(p => p !== first);
  const otherDistricts = others.filter(p => p.resident.neighborhood_id !== first.resident.neighborhood_id);
  return [first, choose(otherDistricts.length ? otherDistricts : others)];
}
