# SoU voice agents

ElevenLabs setup and integration notes for State of Us. Scripted resident
announcements are implemented (see below); interactive microphone conversations
remain a separate future feature.

## First milestone

Build one resident interview: the mayor speaks to a teacher about rent and transit,
and the resident answers using a supplied simulation snapshot. Reuse one resident
agent with different context for different residents. There is no need to create
thousands of ElevenLabs agents for the simulated population.

Use text-to-speech for scripted news announcements and generated policy debriefs.
Add business interviews and moderated town-hall conversations after the first
resident works.

## Configure in ElevenLabs

1. Create an API key with access to the features you use. Keep it on the server in
   the project-root `.env`, under `ELEVENLABS_API_KEY`.
2. Create a conversational agent for resident interviews in ElevenLabs Agents.
   Select English, a voice, and an available LLM for the initial prototype.
3. Paste `prompts/resident.md` into the system prompt, excluding the suggested
   first-message section. Set that greeting in the dashboard's first-message field.
4. Configure sample values for all six dynamic variables in the prompt so you can
   test it in the dashboard. These are runtime context, not `.env` settings.
5. Enable authentication for the agent. Record its agent ID and the chosen voice
   IDs using the variable names in `.env.example`. A voice ID selects a voice;
   an agent ID selects the conversational agent configuration.
6. Choose a newsreader voice if announcements are part of your first demo.
   Configure a supported TTS model when implementing the announcement endpoint.

Merge the needed placeholders from `.env.example` into the existing root `.env`;
do not overwrite your existing key. Never use a `NEXT_PUBLIC_` variable for an API
key. The example contains no credentials and can be committed.

## Context to prepare

| Dynamic variable | Example demo value |
| --- | --- |
| `resident_name` | Jordan |
| `occupation` | Teacher |
| `financial_profile` | Monthly income $4,300; rent $2,000; transport $320; taxes $610; other expenses $1,050; disposable income $320 |
| `priorities` | Affordable rent and a shorter commute |
| `city_context` | Fictional demo city; mayor is considering housing and transit investment |
| `policy_impact` | No policy enacted yet; future outcomes are not available |

The backend should supply these values from the selected resident and current
turn. Use consistent units and distinguish income before and after taxes.
Pass only the context needed for the interview, not the entire city database.

## Application integration to build next

- **Server:** use the existing ElevenLabs SDK and server-side API key to obtain
  a signed URL for an authorized player to connect to the private resident agent.
  Validate the player and selected city before issuing the URL; add request limits.
- **Browser:** once the Next.js frontend exists, install `@elevenlabs/react` and
  implement start/end conversation controls with a WebSocket signed-URL session.
  Request microphone permission, pass resident dynamic variables, and handle
  permission denial and connection failures. Provide text transcripts as well.
- **Announcements:** add a server-side text-to-speech endpoint that accepts
  validated simulation narration and returns audio. Cache repeated announcements
  and generate audio only when needed to control usage.
- **Simulation boundary:** the simulation owns budgets, policies, and outcomes.
  Voice agents explain those results; they do not directly modify city state.

The signed-URL flow here is for WebSocket sessions. If choosing WebRTC instead,
implement the conversation-token flow described in the React SDK documentation.

## Nemotron city voices (implemented)

Set `NVIDIA_API_KEY` in the project-root `.env` and restart Next.js. The optional
`NVIDIA_NEMOTRON_MODEL` defaults to `nvidia/nemotron-3.5-lightning-30b-a3b`.
The server calls NVIDIA's hosted chat-completions endpoint; no key reaches the
browser. ElevenLabs still provides speech using the existing resident voice ID.

Open **City voices** in the top bar for city briefings, selected resident thoughts,
town-hall debates, and comparisons of two proposed policies. Resident profiles
also offer policy-specific thoughts. The sidebar shows recent community voices.
New decisions, resolved outcomes, and events request a Mayor briefing automatically.
Use **Speak** to hear generated text. Live microphone interviews remain future work.

`POST /api/city/:id/insights` reads a consistent database snapshot and returns
validated commentary together with its source facts. Comparisons independently
apply each option to a copy of that snapshot using the simulation's own policy
math. They exclude other queued decisions and never enact a policy. Happiness,
approval, and finances remain simulation-owned; resident stances and conversations
are explicitly fictional opinions from synthetic personas, not individual scores
or survey results. Autonomous policy enactment is not part of this feature.

Generated analyses are cached for two minutes and requests are coalesced and
rate-limited. Missing credentials, timeouts, and invalid responses produce a
clearly labeled scripted fallback with the calculated facts still visible.
Recent analyses are retained in browser memory for the current session and show
their turn number. An automatic speech that finishes after the city advances is
kept in history instead of interrupting the player with a stale briefing.

See [NVIDIA model API documentation](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-5-lightning-30b-a3b-infer).

## Gemini-transcribed Mayor speech (implemented)

Nemotron (or its scripted fallback) still produces the underlying records for every
briefing: the measured summary, per-resident stances, and the resident conversation.
`lib/ai/gemini.ts` takes those records — plus the day number (`facts.turn`) and
today's game event, if any — and asks Gemini to transcribe them into the actual
words the Mayor speaks aloud for that day's performance. The result replaces
`commentary.mayorSpeech` before ElevenLabs voices it through the existing
`/api/resident-speech` endpoint; nothing about the TTS call itself changes.

Set `GEMINI_API_KEY` in the project-root `.env` and restart Next.js. The optional
`GEMINI_MODEL` defaults to `gemini-2.5-flash`. If the key is missing, the request
limit is hit, or the Gemini call fails, the Mayor speaks the records' own
`mayorSpeech` text unchanged (`CityInsight.speechSource` is `'scripted'` instead of
`'gemini'`) — the briefing is never blocked on Gemini being available. The Mayor's
nameplate shows the current day (`Day N`, from `city.turn`, which already advances
once per resolved turn) so the speech is clearly tied to that day's performance.

Today's event is read from the existing `activeEvents`/`GameEvent` data (see
`lib/mockEngine.ts`'s `rollEvent`) via `InsightFacts.event`. The in-development
"one of five events per turn" system is expected to keep populating that same
field, so no further wiring should be needed once it lands.

## Manual acceptance checklist

- Dashboard preview greets the mayor with the supplied resident name.
- Asking about rent produces an answer consistent with the sample finances.
- Asking for an unknown policy result produces an admission of missing data.
- Swapping resident context changes the perspective without carrying over the
  previous resident's finances.
- In the future browser integration, the microphone can be stopped, text remains
  available, and the ElevenLabs API key never appears in browser requests or code.

## Official references

- [Agent authentication and signed URLs](https://elevenlabs.io/docs/eleven-agents/customization/authentication)
- [Dynamic variables](https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables)
- [React SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react)
- [Custom LLM integration](https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm)
- [Text-to-speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)

## Resident announcements (implemented)

`ResidentNarrator` shows the professionally dressed Mayor's generated portrait with queued captions for policy decisions, completed effects, events, and errors. It calls the server-only `/api/resident-speech` endpoint with `ELEVENLABS_RESIDENT_VOICE_ID` and `ELEVENLABS_API_KEY`. The optional `ELEVENLABS_TTS_MODEL_ID` defaults to `eleven_multilingual_v2`. No agent ID or microphone is needed for these scripted reactions. Replay reuses audio; mute persists locally; failed or blocked audio retains readable captions. Requests are length-limited, cached, coalesced, and rate-limited in memory.

Policy submissions lock immediately while a request is in flight. A pending database decision blocks subsequent decisions on both client and server until its turn resolves; a row lock serializes decision creation with turn resolution. Reloading rebuilds the pending lock from database decisions. The current live engine applies all its configured effects atomically on that resolution, so live cards show “Next turn.” Mock mode remains locked until its delayed consequence queue drains. Speech completion does not unlock policies. Use “Advance one turn” or Play to progress.

Voice API reference: https://elevenlabs.io/docs/api-reference/text-to-speech/convert

The Mayor briefing uses a transparent standing portrait over a dimmed map, with a cream dialogue panel and manual Continue/Next navigation. Escape dismisses the current briefing. The same configured ElevenLabs voice remains in use. Portrait source and generation prompt: `public/avatars/mayor-professional.md`.
