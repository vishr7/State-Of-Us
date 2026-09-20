import { afterEach, describe, expect, it, vi } from 'vitest';
import { interviewDialogue, unsupportedInAnswer, type PersonaFacts } from './interviewDialogue';

const stephen: PersonaFacts = {
  name: 'Stephen Cate',
  biography: 'Stephen Cate is a structure-loving, competition-driven supervisor with a weekend ritual of fishing, bowling, and mystery novels.',
  interests: ['Bowling league', 'Rotary club membership', 'Lake Michigan fishing'],
  skills: ['Team scheduling', 'Inventory management'],
};

describe('unsupportedInAnswer (guards against what the model got wrong in testing)', () => {
  it('accepts a first-person answer grounded in their profile', () => {
    expect(unsupportedInAnswer('I like things running on a schedule, so a bus I can rely on fits my routine and my bowling league nights.', stephen)).toBeNull();
  });

  it('rejects numerals, which the audio and captions must not read out', () => expect(unsupportedInAnswer('I would save 10 minutes on my commute.', stephen)).toMatch(/numerals/));

  it('rejects third-person narration', () => {
    expect(unsupportedInAnswer('Stephen says the extra trips would help him.', stephen)).toMatch(/third person/);
    expect(unsupportedInAnswer('He mentions that a schedule matters, and I agree with that.', stephen)).toMatch(/third person/);
    expect(unsupportedInAnswer('More frequent trains would suit the neighborhood well.', stephen)).toMatch(/first person/);
  });

  it('rejects family that is not in the profile, but allows it when the profile says so', () => {
    expect(unsupportedInAnswer('My commute is long enough with the kids and everything.', stephen)).toMatch(/family detail/);
    expect(unsupportedInAnswer('I still want to be home for my kids.', { ...stephen, biography: 'A supervisor and devoted father of two kids.' })).toBeNull();
  });

  it('rejects a place taken from the dataset instead of Pittsburgh', () => {
    expect(unsupportedInAnswer('I could finally get out fishing on Lake Michigan on my days off.', stephen)).toMatch(/place/);
  });
});

describe('interviewDialogue', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const people = [
    { resident: { id: 'a' }, persona: { name: 'Mary Alberti', interests: ['Bullet journaling'], skills: [], biography: 'A bullet journal fan.' } },
    { resident: { id: 'b' }, persona: stephen },
  ];
  const reply = (interviews: unknown[]) => vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ interviews }) } }] }) }));

  it('does nothing without an API key', async () => {
    vi.stubEnv('NVIDIA_API_KEY', ''); vi.stubEnv('NEMOTRON_API_KEY', '');
    expect(await interviewDialogue(people, {})).toBeNull();
  });

  it('keeps the valid answer and drops the invalid one, so only that person falls back', async () => {
    vi.stubEnv('NVIDIA_API_KEY', 'test');
    vi.stubGlobal('fetch', reply([
      { residentId: 'a', question: 'What do you think about it?', answer: 'I would keep my bullet journal routes tidy if buses ran more often.' },
      { residentId: 'b', question: 'And you, sir, what is your view?', answer: 'Stephen says he would love the extra trains for himself.' },
    ]));
    const result = await interviewDialogue(people, {});
    expect(result?.map(r => r.residentId)).toEqual(['a']);
  });

  it('returns null when nothing usable comes back', async () => {
    vi.stubEnv('NVIDIA_API_KEY', 'test');
    vi.stubGlobal('fetch', reply([
      { residentId: 'a', question: 'What do you think about it?', answer: 'It would save me 10 minutes every single day.' },
      { residentId: 'b', question: 'And you, sir, what is your view?', answer: 'I could fish on Lake Michigan far more often now.' },
    ]));
    expect(await interviewDialogue(people, {})).toBeNull();
  });

  it('returns null on an API error', async () => {
    vi.stubEnv('NVIDIA_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await interviewDialogue(people, {})).toBeNull();
  });
});
