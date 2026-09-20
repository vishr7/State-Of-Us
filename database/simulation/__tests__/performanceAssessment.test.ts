import { expect, it } from 'vitest';
import { assessPerformance } from '../performanceAssessment';
import type { SimulationState } from '../../types/database';
const baseline = { turn: 0, city: { happiness: 50, approval: 50 }, neighborhoods: [{ id: 'a', happiness: 50 }] } as SimulationState;
it('awards for measured improvements', () => {
  const result = assessPerformance(3, baseline, { city: { ...baseline.city, happiness: 52, approval: 53 }, neighborhoods: [{ ...baseline.neighborhoods[0], happiness: 51 }] });
  expect(result.grant).toBe(105000);
  expect(result.baselineDay).toBe(1);
});
it('awards nothing for unchanged or worse results', () => {
  expect(assessPerformance(3, baseline, baseline).grant).toBe(0);
  expect(assessPerformance(3, baseline, { ...baseline, city: { ...baseline.city, happiness: 40, approval: 40 } }).grant).toBe(0);
});
it('caps each award', () => {
  expect(assessPerformance(6, baseline, { ...baseline, city: { ...baseline.city, happiness: 100, approval: 100 } }).grant).toBe(500000);
});
