import { describe, expect, it } from 'vitest';
import { briefingSpeaker } from './speakers';
describe('city speaker schedule', () => {
  it('reserves the Mayor for the introduction and every third day', () => {
    for (let day = 1; day <= 15; day++) expect(briefingSpeaker(day, 'outcome')).toBe([1,3,6,9,12,15].includes(day) ? 'mayor' : 'assistant');
  });
  it('gives breaking news to the anchor and decisions to the assistant', () => {
    expect(briefingSpeaker(3, 'event')).toBe('news');
    expect(briefingSpeaker(3, 'decision')).toBe('assistant');
  });
});
