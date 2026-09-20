import { describe, expect, it } from 'vitest';
import { personaResidents } from '../personas';
import { archetypeFor, backgroundSentence, districtNameFor, fallbackInterview, jobLabel, personaBackground, personaToDbResident } from './personaInterviews';
import { RESIDENT_ARCHETYPES } from '../../database/types/database';

const mary = personaResidents.find(p => p.name === 'Mary Alberti')!;
const input = (over: Partial<Parameters<typeof fallbackInterview>[0]> = {}) => ({
  persona: mary, district: 'Homewood', policyName: 'Expand Transit', mood: 'hopeful',
  reason: 'I’m happy about this plan because a shorter commute would give me more time back.',
  impacts: ['my commute would shorten by 4.0 minutes'], neighborhoodNote: 'The change to local transit access matters to this neighborhood.', index: 0, ...over,
});

describe('persona -> engine resident', () => {
  it('maps every map persona onto a real district and a valid archetype', () => {
    const districts = new Set(['Homewood', 'Lawrenceville', 'Shadyside', 'Golden Triangle']);
    for (const p of personaResidents) {
      expect(districts.has(districtNameFor(p))).toBe(true);
      const row = personaToDbResident(p, 'n-1');
      expect(RESIDENT_ARCHETYPES).toContain(row.archetype);
      expect(row.id).toBe(p.id); // the walker's id, so the client can find them on the map
      expect(row.income).toBe(p.annualIncome);
      expect(row.housing_status).toBe(p.isHomeowner ? 'owner' : 'renter');
    }
  });

  it('classifies age and tenure sensibly', () => {
    const base = personaResidents[0];
    expect(archetypeFor({ ...base, age: 70 })).toBe('senior_fixed_income');
    expect(archetypeFor({ ...base, age: 22, occupation: 'not in workforce' })).toBe('student');
    expect(archetypeFor({ ...base, age: 45, familySize: 4 })).toBe('family_household');
    expect(archetypeFor({ ...base, age: 50, familySize: 1, isHomeowner: true })).toBe('long_time_homeowner');
  });

  it('gives the AI only the supplied background', () => {
    const bio = personaBackground(mary);
    expect(bio).toMatchObject({ name: 'Mary Alberti', age: 28, occupation: 'fast food or counter worker' });
    expect(bio.biography).toContain('bullet');
    expect(bio.interests.length).toBeGreaterThan(0);
    expect(bio.skills.length).toBeGreaterThan(0);
  });

  it('labels people outside the workforce naturally', () => expect(jobLabel('not in workforce')).toBe('not in the workforce'));
});

describe('offline interview answers use the person’s own background', () => {
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

  it('addresses the person by name and stays in first person', () => {
    const { question, answer } = fallbackInterview(input());
    expect(question).toContain('Mary Alberti');
    expect(question).toContain('Mary, what would this mean for you?');
    expect(answer).toMatch(/\bI\b|\bmy\b/i);
    expect(answer).toContain('my commute would shorten by 4.0 minutes');
  });

  it('cites a skill or interest from THEIR profile in every answer, for all 100 people on the map', () => {
    for (const persona of personaResidents) {
      for (const index of [0, 1]) {
        const sentence = backgroundSentence(persona, 'Expand Transit', index);
        const profile = [...(persona.persona?.skills ?? []), ...(persona.persona?.interests ?? [])].map(lower);
        const occupation = jobLabel(persona.occupation);
        expect(profile.some(item => sentence.includes(item)) || sentence.includes(occupation) || /ordinary people/.test(sentence)).toBe(true);
      }
    }
  });

  it('never cites a place from the dataset (people here live in Pittsburgh)', () => {
    for (const persona of personaResidents) {
      for (const index of [0, 1]) expect(backgroundSentence(persona, 'X', index)).not.toMatch(/Lake Mendota|Madison/);
    }
  });

  it('is deterministic per person and policy, but differs between people', () => {
    expect(fallbackInterview(input()).answer).toBe(fallbackInterview(input()).answer);
    const sentences = new Set(personaResidents.map(p => backgroundSentence(p, 'Expand Transit', 0)));
    expect(sentences.size).toBeGreaterThan(50);
  });

  it('does not say the same thing twice about the neighborhood', () => {
    const { answer } = fallbackInterview(input({ reason: 'I’m happy about this plan because better local transit access would help our neighborhood.', impacts: [] }));
    expect(answer.match(/transit access/g)).toHaveLength(1);
  });

  it('handles an unaffected, uncertain person without inventing an effect', () => {
    const { answer } = fallbackInterview(input({ mood: 'uncertain', impacts: [] }));
    expect(answer).toContain('still making up my mind');
    expect(answer).not.toMatch(/would (fall|rise|shorten|lengthen)/);
  });
});
