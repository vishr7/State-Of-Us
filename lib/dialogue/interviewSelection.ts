import type { Resident, Neighborhood } from '../../database/types/database';
export function interviewImpact(before: Resident, after: Resident, district: Neighborhood, nextDistrict: Neighborhood) {
  const factors = [
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
export function selectInterviewees<T extends { resident: Resident; score: number; mood: string }>(people: T[]): T[] {
  const sorted = [...people].sort((a,b) => a.score - b.score || a.resident.id.localeCompare(b.resident.id));
  if (sorted.length <= 3) return sorted;
  const selected = [sorted[0], sorted[sorted.length - 1]];
  const diversity = (p: T) => selected.reduce((sum, s) => sum + Number(p.resident.neighborhood_id !== s.resident.neighborhood_id) + Number(p.resident.housing_status !== s.resident.housing_status) + Number(p.resident.archetype !== s.resident.archetype) + Number(Math.floor(p.resident.age / 20) !== Math.floor(s.resident.age / 20)) + Number(Math.floor(p.resident.income / 30000) !== Math.floor(s.resident.income / 30000)) + 2 * Number(p.mood !== s.mood), 0);
  const remaining = sorted.filter(p => !selected.includes(p)).sort((a,b) => diversity(b) - diversity(a) || Math.abs(a.score) - Math.abs(b.score));
  return [...selected, remaining[0]];
}
