import { expect, it } from 'vitest';
import { demographicImpacts } from '../trialReport';
import type { SimulationState, Resident } from '@/database/types/database';
it('compares matched residents in starting income cohorts with population weights', () => {
  const residents = [
    { id: 'a', income: 30000, age: 25, family_size: 3, happiness: 50, housing_cost: 900, commute_minutes: 40 },
    { id: 'b', income: 35000, age: 70, family_size: 1, happiness: 50, housing_cost: 900, commute_minutes: 40 },
  ] as Resident[];
  const before = { residents } as SimulationState;
  const after = { residents: [ { ...residents[0], income: 45000, happiness: 60, housing_cost: 800 }, { ...residents[1], happiness: 40 } ] } as SimulationState;
  const groups = demographicImpacts(before, after);
  expect(groups[0]).toMatchObject({ population: 4, happiness: 5, housing: -75 });
  expect(groups.find(g => g.label.startsWith('Older'))?.happiness).toBe(-10);
  expect(groups.find(g => g.label.startsWith('Middle'))).toBeUndefined();
});
it('does not invent values for missing residents', () => {
  expect(demographicImpacts({ residents: [] } as unknown as SimulationState, { residents: [] } as unknown as SimulationState)).toEqual([]);
});

import { trialGrade } from '../trialReport';
it('grades improvement and penalizes concentrated demographic losses', () => {
  const r = { id: 'a', income: 30000, age: 25, family_size: 1, happiness: 50, housing_cost: 900, commute_minutes: 40 } as Resident;
  const before = { city: { happiness: 50, approval: 50 }, residents: [r] } as SimulationState;
  expect(trialGrade(before, before)?.letter).toBe('C');
  const improved = { city: { happiness: 60, approval: 50 }, residents: [{ ...r, happiness: 60 }] } as SimulationState;
  expect(trialGrade(before, improved)).toMatchObject({ letter: 'A', score: 90 });
  expect(trialGrade(before, { ...improved, residents: [{ ...r, happiness: 40 }] })).toMatchObject({ letter: 'C', score: 70 });
  expect(trialGrade(before, { ...improved, residents: [] })).toBeNull();
});
