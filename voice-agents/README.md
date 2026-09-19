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

## Where Nemotron fits

For the first voice test, a dashboard LLM and fixed sample context are sufficient.
For the intended architecture, Nemotron produces resident reasoning and the
simulation provides the financial facts. You have two integration options:

- Generate resident reactions with Nemotron on the backend and send the completed
  text to ElevenLabs TTS. This is a straightforward path for spoken reactions.
- For live interviews powered by Nemotron, configure an ElevenLabs custom LLM
  backed by a compatible hosted endpoint or your own adapter. Verify endpoint,
  streaming, and authentication compatibility before connecting it. Keep its
  credentials server-side or in ElevenLabs secrets.

Installing the ElevenLabs SDK does not connect Nemotron automatically. No NVIDIA
credentials or endpoint are needed for the initial ElevenLabs-only voice test.

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
