import { describe, expect, it } from 'vitest';
import { personaResidents } from '../personas';
import { educationLabel, householdLabel, incomeLabel, residentFacts } from '../residentFacts';

const mary = personaResidents.find(p => p.name === 'Mary Alberti')!;

describe('resident facts', () => {
  it('lists age, household, housing, commute, income and education', () => {
    const facts = residentFacts({ ...mary, age: 28, familySize: 3, isHomeowner: false, commuteMins: 42, commuteMode: 'bus', annualIncome: 40000, persona: { ...mary.persona!, education: 'high_school' } });
    expect(facts).toEqual(['Age 28', 'Household of 3', 'Renter', '42 min commute by bus', '$40K a year', 'High school']);
  });

  it('words a one-person household and a homeowner naturally', () => {
    expect(householdLabel(1)).toBe('Lives alone');
    expect(householdLabel(4)).toBe('Household of 4');
    expect(residentFacts({ ...mary, isHomeowner: true })).toContain('Homeowner');
  });

  it('formats each commute mode', () => {
    const modes = { bus: 'by bus', car: 'by car', walk: 'on foot', bike: 'by bike', incline: 'by incline' } as const;
    for (const [mode, phrase] of Object.entries(modes)) {
      expect(residentFacts({ ...mary, commuteMins: 20, commuteMode: mode as keyof typeof modes })).toContain(`20 min commute ${phrase}`);
    }
  });

  it('formats income and education', () => {
    expect(incomeLabel(104000)).toBe('$104K a year');
    expect(incomeLabel(500)).toBe('$500 a year');
    expect(educationLabel('bachelors')).toBe('Bachelor’s degree');
    expect(educationLabel('9th_12th_no_diploma')).toBe('No high school diploma');
    expect(educationLabel('some_new_value')).toBe('Some new value');
    expect(educationLabel(undefined)).toBeNull();
  });

  it('produces clean, complete facts for every resident on the map', () => {
    for (const resident of personaResidents) {
      const facts = residentFacts(resident);
      expect(facts.length).toBeGreaterThanOrEqual(5);
      for (const fact of facts) expect(fact).not.toMatch(/undefined|NaN|null|_/);
      expect(facts[0]).toBe(`Age ${resident.age}`);
    }
  });
});
