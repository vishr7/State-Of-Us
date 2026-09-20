import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
const cache = new Map<string, ArrayBuffer>();
const inFlight = new Map<string, Promise<ArrayBuffer>>();
let windowStart = Date.now();
let requests = 0;

/** Scripted resident reactions. Credentials and voice selection stay server-side. */
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'This voice endpoint is only available from the game.' }, { status: 403 });
  }
  let text: unknown;
  let speaker: unknown;
  try { ({ text, speaker } = await request.json()); }
  catch { return NextResponse.json({ error: 'Invalid narration request.' }, { status: 400 }); }
  if (typeof text !== 'string' || !text.trim() || text.length > 900) {
    return NextResponse.json({ error: 'Narration must contain 1–900 characters.' }, { status: 400 });
  }
  const key = process.env.ELEVENLABS_API_KEY;
  if (speaker !== undefined && !['mayor', 'assistant', 'news', 'resident'].includes(String(speaker))) return NextResponse.json({ error: 'Unknown speaker.' }, { status: 400 });
  const voices = { mayor: process.env.ELEVENLABS_MAYOR_VOICE_ID, assistant: process.env.ELEVENLABS_ASSISTANT_VOICE_ID, news: process.env.ELEVENLABS_NEWS_VOICE_ID, resident: process.env.ELEVENLABS_RESIDENT_VOICE_ID || process.env.ELEVENLABS_ASSISTANT_VOICE_ID };
  const voice = voices[(speaker ?? 'resident') as keyof typeof voices];
  if (!key || !voice) return NextResponse.json({ error: 'Resident voice is not configured. Captions are still available.' }, { status: 503 });
  const model = process.env.ELEVENLABS_TTS_MODEL_ID || 'eleven_multilingual_v2';
  const cacheKey = `${voice}:${model}:${text}`;
  const audioResponse = (audio: ArrayBuffer) => new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store' } });
  const cached = cache.get(cacheKey);
  if (cached) return audioResponse(cached);
  if (Date.now() - windowStart > 60_000) { requests = 0; windowStart = Date.now(); }
  if (!inFlight.has(cacheKey) && ++requests > 30) return NextResponse.json({ error: 'Voice is busy. Please retry shortly; captions are available.' }, { status: 429 });
  try {
    let work = inFlight.get(cacheKey);
    if (!work) {
      const narration = text;
      work = (async () => {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
          method: 'POST',
          headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({ text: narration, model_id: model }),
          signal: AbortSignal.timeout(25_000),
        });
        if (!response.ok) throw new Error(`Voice service returned ${response.status}`);
        const audio = await response.arrayBuffer();
        if (cache.size >= 32) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, audio);
        return audio;
      })();
      inFlight.set(cacheKey, work);
    }
    return audioResponse(await work);
  } catch (error) {
    console.error('Resident speech unavailable:', error instanceof Error ? error.message : 'request failed');
    return NextResponse.json({ error: 'Resident voice is temporarily unavailable. Read the caption or try replay.' }, { status: 502 });
  } finally { inFlight.delete(cacheKey); }
}
