import type { SimulationState } from '../types/database';
export interface PerformanceAssessment { day: number; baselineDay: number; happinessChange: number; approvalChange: number; improvedDistricts: number; grant: number }
/** Authored game rules: awards cannot be invented by dialogue or awarded twice. */
export function assessPerformance(day: number, baseline: SimulationState, current: Pick<SimulationState, 'city' | 'neighborhoods'>): PerformanceAssessment {
  const happinessChange = Math.round((current.city.happiness - baseline.city.happiness) * 100) / 100;
  const approvalChange = Math.round((current.city.approval - baseline.city.approval) * 100) / 100;
  const improvedDistricts = current.neighborhoods.filter(n => n.happiness > (baseline.neighborhoods.find(b => b.id === n.id)?.happiness ?? n.happiness)).length;
  const grant = Math.min(500000, Math.floor(Math.max(0, happinessChange) * 25000 + Math.max(0, approvalChange) * 10000 + improvedDistricts * 25000));
  return { day, baselineDay: baseline.turn + 1, happinessChange, approvalChange, improvedDistricts, grant };
}
