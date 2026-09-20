import type { Resident, SimulationState } from '../../database/types/database';

/** Cover each district and both ends of its measured benefit distribution. */
export function selectEmotionResidents(before: SimulationState, after: SimulationState): Resident[] {
  const score = (r: Resident) => {
    const next = after.residents.find(n => n.id === r.id) ?? r;
    return (next.happiness - r.happiness) + (r.housing_cost - next.housing_cost) / Math.max(r.income / 12, 1) * 100
      + (r.commute_minutes - next.commute_minutes) * r.transit_sensitivity;
  };
  return [...new Set(before.residents.map(r => r.neighborhood_id))].sort().flatMap(id => {
    const rows = before.residents.filter(r => r.neighborhood_id === id).sort((a,b) => score(b) - score(a) || a.id.localeCompare(b.id));
    return [...new Map([rows[0], rows[Math.floor(rows.length / 2)], rows.at(-1)].filter((r): r is Resident => !!r).map(r => [r.id, r])).values()];
  });
}

export interface EmotionalMemory {
  turn: number; supportScore: number; reaction: string;
  emotions?: { hope: number; anxiety: number; anger: number; trust: number; fairness: number };
}
export interface SocialVoice { residentId: string; neighborhood: string; supportScore: number; reaction: string }
