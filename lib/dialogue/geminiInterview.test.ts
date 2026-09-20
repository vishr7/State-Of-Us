import { describe, expect, it, vi } from 'vitest';
import { personaResidents } from '../personas';
import { geminiInterviewAnswers, geminiInterviewInput, type InterviewOption, type InterviewSubject } from './geminiInterview';
import { personaBackground } from './personaInterviews';
import type { GeminiClient } from '../agents/gemini';

const [mary, stephen] = ['Mary Alberti', 'Stephen Cate'].map(name => personaResidents.find(p => p.name === name)!);
const subject = (persona: typeof mary, over: Partial<InterviewSubject> = {}): InterviewSubject => ({
  residentId: persona.id, persona: personaBackground(persona), neighborhood: 'Homewood', housing: persona.isHomeowner ? 'owner' : 'renter',
  mood: 'hopeful', feeling: 'I’m happy about this plan because a shorter commute would give me more time back.',
  changes: ['my commute would shorten by 4.0 minutes'], neighborhoodNote: 'The change to local transit access matters to this neighborhood.', ...over,
});
const subjects = [subject(mary), subject(stephen)];
const option: InterviewOption = {
  title: 'Expand Transit', description: 'Add a new bus line.', benefits: ['Faster trips'], risks: ['Running costs'],
  policy: { name: 'Expand Transit', category: 'transit', description: 'Add a new bus line.', upfrontCost: 1200000, recurringCost: 60000 },
};
const answersFor = (a: string, b: string) => ({ answers: [{ residentId: mary.id, answer: a }, { residentId: stephen.id, answer: b }] });
const clientReturning = (value: unknown) => vi.fn(async () => value) as unknown as GeminiClient & ReturnType<typeof vi.fn>;

describe('what Gemini is given', () => {
  it('includes each person’s Nemotron persona, the selected option, and what it changes for them', () => {
    const input = geminiInterviewInput(subjects, option);
    expect(input.selectedOption.title).toBe('Expand Transit');
    expect(input.selectedOption.risks).toEqual(['Running costs']);
    const [first, second] = input.people;
    expect(first).toMatchObject({ residentId: mary.id, name: 'Mary Alberti', occupation: 'fast food or counter worker', neighborhood: 'Homewood' });
    expect(first.biography).toBe(mary.persona!.biography);
    expect(first.interests).toEqual(mary.persona!.interests);
    expect(first.skills).toEqual(mary.persona!.skills);
    expect(first.whatChangesForThem).toEqual(['my commute would shorten by 4.0 minutes']);
    expect(second.biography).toBe(stephen.persona!.biography);
    expect(first.biography).not.toBe(second.biography);
  });

  it('asks for a different reaction to this option and forbids invented facts', async () => {
    const client = clientReturning(answersFor('I keep a bullet journal of my routes, so a more reliable bus would suit my routine well.', 'I like a good schedule, and fishing on weekends means I would happily leave the car at home.'));
    await geminiInterviewAnswers(subjects, option, client);
    const request = client.mock.calls[0][0];
    expect(request.system).toMatch(/two different people/);
    expect(request.system).toMatch(/ONLY source of personal facts/);
    expect(request.system).toMatch(/numerals/);
    expect(request.input).toEqual(geminiInterviewInput(subjects, option));
  });
});

describe('geminiInterviewAnswers', () => {
  const good = ['I keep a bullet journal of my routes, so a more reliable bus would suit my routine well.', 'I like a good schedule, and my weekend fishing means I would happily leave the car at home.'] as const;

  it('returns both answers when they pass validation', async () => {
    const result = await geminiInterviewAnswers(subjects, option, clientReturning(answersFor(...good)));
    expect(result).toEqual([{ residentId: mary.id, answer: good[0] }, { residentId: stephen.id, answer: good[1] }]);
  });

  it('drops only the answer that breaks the rules, so only that person falls back', async () => {
    const result = await geminiInterviewAnswers(subjects, option, clientReturning(answersFor(good[0], 'Stephen says he would save 10 minutes on the bus every single day.')));
    expect(result?.map(r => r.residentId)).toEqual([mary.id]);
  });

  it('returns null when nothing usable comes back, or both answers are identical', async () => {
    expect(await geminiInterviewAnswers(subjects, option, clientReturning(answersFor('It would save me 10 minutes daily.', 'Lake Michigan is calling me.')))).toBeNull();
    expect(await geminiInterviewAnswers(subjects, option, clientReturning(answersFor(good[0], good[0])))).toBeNull();
  });

  it('retries after a rate limit (HTTP 429), then succeeds', async () => {
    const client = vi.fn().mockRejectedValueOnce(new Error('Gemini returned HTTP 429.')).mockResolvedValueOnce(answersFor(...good)) as unknown as GeminiClient & ReturnType<typeof vi.fn>;
    const result = await geminiInterviewAnswers(subjects, option, client, 5_000, 0);
    expect(client).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });

  it('gives up after repeated rate limits (one try plus two retries), and does not retry other errors', async () => {
    const limited = vi.fn().mockRejectedValue(new Error('Gemini returned HTTP 429.')) as unknown as GeminiClient & ReturnType<typeof vi.fn>;
    expect(await geminiInterviewAnswers(subjects, option, limited, 5_000, 0)).toBeNull();
    expect(limited).toHaveBeenCalledTimes(3);
    const broken = vi.fn().mockRejectedValue(new Error('Gemini returned HTTP 500.')) as unknown as GeminiClient & ReturnType<typeof vi.fn>;
    expect(await geminiInterviewAnswers(subjects, option, broken, 5_000, 0)).toBeNull();
    expect(broken).toHaveBeenCalledTimes(1);
  });

  it('abandons a slow Gemini quickly so the day is not held up', async () => {
    const hang = (() => new Promise(() => {})) as unknown as GeminiClient;
    const started = Date.now();
    expect(await geminiInterviewAnswers(subjects, option, hang, 30)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('only interviews exactly two people', async () => {
    expect(await geminiInterviewAnswers([subjects[0]], option, clientReturning(answersFor(...good)))).toBeNull();
  });
});
