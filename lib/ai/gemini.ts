import { createHash } from 'node:crypto';
import type { Commentary, InsightFacts } from './contracts';

export interface MayorSpeech { text: string; source: 'gemini' | 'scripted'; notice?: string }

const cache = new Map<string, { expires: number; value: string }>();
const pending = new Map<string, Promise<MayorSpeech>>();
let calls = 0;
let windowStart = Date.now();

function clean(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^\s*```(?:\w+)?\s*/, '')
    .replace(/\s*```\s*$/, '')
    .trim()
    .replace(/^["“]([\s\S]*)["”]$/, '$1')
    .trim();
}

const system = `You transcribe the exact spoken words for the Mayor of State of Us, a fictional Pittsburgh city simulation, for a short "Day N" performance address delivered aloud through text-to-speech. You receive JSON records already produced by another analysis model: a measured summary of the day's happiness and tradeoffs, per-resident synthetic opinions, a brief resident conversation, the day number, and today's game event if one occurred. Rewrite those records into ONE short, natural first-person speech the Mayor would actually say out loud to the public — not a report, not a list, not JSON, no headings. Reference only facts present in the supplied records; never invent numbers, outcomes, policies, or events. Acknowledge the day's event briefly if one is supplied. Keep a warm, plain-spoken, professional tone. Output ONLY the spoken words as plain text, no quotation marks or markdown, under 850 characters.`;

/** Takes Nemotron's (or the scripted fallback's) commentary records and asks Gemini to transcribe them into the Mayor's spoken end-of-day address. Falls back to the records' own `mayorSpeech` if Gemini is unconfigured, rate-limited, or fails. */
export async function generateMayorSpeech(facts: InsightFacts, commentary: Commentary): Promise<MayorSpeech> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const key = process.env.GEMINI_API_KEY;
  const hash = createHash('sha256').update(JSON.stringify({ model, facts, commentary })).digest('hex');
  const cached = cache.get(hash);
  if (cached && cached.expires > Date.now()) return { text: cached.value, source: 'gemini' };
  const existing = pending.get(hash); if (existing) return existing;
  const work = (async (): Promise<MayorSpeech> => {
    const fallback = (notice: string): MayorSpeech => ({ text: commentary.mayorSpeech, source: 'scripted', notice });
    if (!key) return fallback('Gemini is not configured. Speaking the analysis model’s own speech text.');
    if (Date.now() - windowStart > 60000) { calls = 0; windowStart = Date.now(); }
    if (++calls > 15) return fallback('Gemini request limit reached. Speaking the analysis model’s own speech text.');
    try {
      const records = {
        day: facts.turn,
        cityName: facts.cityName,
        mode: facts.mode,
        summary: commentary.summary,
        residents: commentary.residents,
        conversation: commentary.conversation,
        event: facts.event ?? null,
      };
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(records) }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 400 },
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`Gemini status ${response.status}`);
      const payload = await response.json();
      const parts = payload?.candidates?.[0]?.content?.parts;
      const raw = Array.isArray(parts) ? parts.map((p: { text?: string }) => p?.text ?? '').join('') : '';
      const text = clean(raw).slice(0, 900);
      if (!text) throw new Error('Empty Gemini response');
      if (cache.size >= 40) cache.delete(cache.keys().next().value!);
      cache.set(hash, { expires: Date.now() + 120000, value: text });
      return { text, source: 'gemini' };
    } catch (error) {
      console.error('Gemini mayor speech unavailable:', error instanceof Error ? error.message.slice(0, 180) : 'request failed');
      return fallback('Gemini is temporarily unavailable. Speaking the analysis model’s own speech text.');
    }
  })();
  pending.set(hash, work);
  try { return await work; } finally { pending.delete(hash); }
}
