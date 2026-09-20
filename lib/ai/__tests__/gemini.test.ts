import { afterEach, describe, expect, it, vi } from 'vitest';
import { fallbackCommentary } from '../nemotron';
import { generateMayorSpeech } from '../gemini';
import type { InsightFacts } from '../contracts';

const facts: InsightFacts = {
  cityName: 'Test city', turn: 1, mode: 'briefing',
  current: { treasury: 100, happiness: 50, approval: 40, averageRent: 10, revenue: 20, expenses: 10 }, previous: null,
  policies: [], scenarios: [], neighborhoods: [],
  residents: [{ id: 'r1', name: 'Resident', occupation: 'teacher', neighborhood: 'Oakland', income: 50000, housing: 'renter', priorities: ['housing'], neighborhoodHappiness: 50 }],
};
const commentary = fallbackCommentary(facts);

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Gemini mayor speech', () => {
  it('falls back to the records’ own speech without an API key', async () => {
    vi.stubEnv('GEMINI_API_KEY', ''); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await generateMayorSpeech({ ...facts, turn: 101 }, commentary);
    expect(result.source).toBe('scripted');
    expect(result.text).toBe(commentary.mayorSpeech);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back without failing the briefing when Gemini errors', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    const result = await generateMayorSpeech({ ...facts, turn: 102 }, commentary);
    expect(result.source).toBe('scripted');
    expect(result.notice).toMatch(/unavailable/);
  });

  it('uses the transcribed Gemini text when the call succeeds', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test');
    const body = { candidates: [{ content: { parts: [{ text: 'Good evening, neighbors.' }] } }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    const result = await generateMayorSpeech({ ...facts, turn: 103 }, commentary);
    expect(result.source).toBe('gemini');
    expect(result.text).toBe('Good evening, neighbors.');
    const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    const context = JSON.parse(request.contents[0].parts[0].text);
    expect(context.current).toEqual(facts.current);
    expect(context.policies).toEqual(facts.policies);
    expect(context.previous).toBeNull();
  });
});
