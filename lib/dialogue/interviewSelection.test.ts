import { expect, it } from 'vitest';
import type { Resident } from '../../database/types/database';
import { selectInterviewees } from './interviewSelection';
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
