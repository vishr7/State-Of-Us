import type { Resident, SimulationState } from '@/database/types/database';

/** Keep residents in their starting income group so income changes don't distort comparisons. */
export function demographicImpacts(before: SimulationState, after: SimulationState) {
  const end = new Map(after.residents.map(r => [r.id, r]));
  const groups: [string, (r: Resident) => boolean][] = [
    ['Lower income · under $40k', r => r.income < 40000],
    ['Middle income · $40k–$100k', r => r.income >= 40000 && r.income < 100000],
    ['Higher income · $100k+', r => r.income >= 100000],
    ['Young adults · under 30', r => r.age < 30],
    ['Older residents · 65+', r => r.age >= 65],
  ];
  return groups.flatMap(([label, matches]) => {
    const rows = before.residents.filter(r => matches(r) && end.has(r.id));
    const population = rows.reduce((n, r) => n + r.family_size, 0);
    if (!population) return [];
    const change = (key: 'happiness' | 'housing_cost' | 'commute_minutes') => rows.reduce((n, r) => n + (end.get(r.id)![key] - r[key]) * r.family_size, 0) / population;
    return [{ label, population, happiness: change('happiness'), housing: change('housing_cost'), commute: change('commute_minutes') }];
  });
}

/** Game score: stable outcomes start at C; improvement earns higher grades. */
export function trialGrade(before: SimulationState, after: SimulationState) {
  const happiness = after.city.happiness - before.city.happiness;
  const approval = after.city.approval - before.city.approval;
  const impacts = demographicImpacts(before, after);
  if (!impacts.length || ![happiness, approval].every(Number.isFinite)) return null;
  const worstLoss = Math.max(0, ...impacts.map(group => -group.happiness));
  const score = Math.round(Math.min(100, Math.max(0, 70 + happiness * 2 + approval - worstLoss * 2)));
  const letter = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  const summary = { A: 'A city moving forward together', B: 'Strong progress, with room to grow', C: 'A steady start—keep listening', D: 'Some residents need more support', F: 'Time to rethink the city’s priorities' }[letter];
  return { score, letter, summary, happiness, approval, worstLoss };
}
