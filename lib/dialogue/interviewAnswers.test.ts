import { describe, expect, it, vi } from 'vitest';
import { personaResidents } from '../personas';
import type { InterviewOption, InterviewSubject } from './geminiInterview';
import { interviewAnswers, type AnswerProviders } from './interviewAnswers';
import { personaBackground } from './personaInterviews';

const [mary, stephen] = ['Mary Alberti', 'Stephen Cate'].map(name => personaResidents.find(p => p.name === name)!);
const subject = (persona: typeof mary): InterviewSubject => ({
  residentId: persona.id, persona: personaBackground(persona), neighborhood: 'Homewood', housing: 'renter', mood: 'hopeful',
  feeling: 'I’m happy about this plan.', changes: [], neighborhoodNote: 'note',
});
const subjects = [subject(mary), subject(stephen)];
const option: InterviewOption = { title: 'Expand Transit', benefits: [], risks: [], policy: { name: 'Expand Transit', category: 'transit', description: 'd', upfrontCost: 0, recurringCost: 0 } };

const providers = (gemini: Awaited<ReturnType<AnswerProviders['gemini']>>, nemotron: Awaited<ReturnType<AnswerProviders['nemotron']>>) => ({
  gemini: vi.fn(async () => gemini), nemotron: vi.fn(async () => nemotron),
});

describe('who writes each answer', () => {
  it('uses Gemini when it produces answers, without calling Nemotron', async () => {
    const p = providers([{ residentId: mary.id, answer: 'gemini says A' }, { residentId: stephen.id, answer: 'gemini says B' }], null);
    const answers = await interviewAnswers(subjects, option, p);
    expect(answers.get(mary.id)).toEqual({ answer: 'gemini says A', source: 'gemini' });
    expect(answers.get(stephen.id)?.source).toBe('gemini');
    expect(p.nemotron).not.toHaveBeenCalled();
  });

  it('falls back to Nemotron only when Gemini gave nothing, and hands it the persona and the option', async () => {
    const p = providers(null, [{ residentId: mary.id, answer: 'nemotron says A' }]);
    const answers = await interviewAnswers(subjects, option, p);
    expect(answers.get(mary.id)).toEqual({ answer: 'nemotron says A', source: 'nemotron' });
    expect(answers.has(stephen.id)).toBe(false); // the caller builds this person's answer from their profile
    const [people, passedOption] = p.nemotron.mock.calls[0] as unknown as [{ resident: { id: string }; persona: { biography?: string } }[], InterviewOption];
    expect(people.map(person => person.resident.id)).toEqual([mary.id, stephen.id]);
    expect(people[0].persona.biography).toBe(mary.persona!.biography);
    expect(passedOption.title).toBe('Expand Transit');
  });

  it('keeps a partial Gemini result (one person) instead of throwing it away for Nemotron', async () => {
    const p = providers([{ residentId: stephen.id, answer: 'gemini says B' }], [{ residentId: mary.id, answer: 'nemotron says A' }]);
    const answers = await interviewAnswers(subjects, option, p);
    expect([...answers.keys()]).toEqual([stephen.id, mary.id]);
    expect(answers.get(stephen.id)?.source).toBe('gemini');
    expect(answers.get(mary.id)?.source).toBe('nemotron');
  });

  it('returns nothing when every provider fails', async () => {
    expect((await interviewAnswers(subjects, option, providers(null, null))).size).toBe(0);
  });

  it('does not let two residents say the exact same generated line', async () => {
    const p = providers([{ residentId: mary.id, answer: 'Same generic response' }, { residentId: stephen.id, answer: 'Same generic response' }], null);
    expect((await interviewAnswers(subjects, option, p)).size).toBe(1);
  });

  it('still permits personal fallback when providers throw', async () => {
    const failing = async () => { throw new Error('Unavailable'); };
    expect((await interviewAnswers(subjects, option, { gemini: failing, nemotron: failing })).size).toBe(0);
  });
});
