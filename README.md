# State of Us

**State of Us** is a data-grounded city simulation game where the player acts as mayor of Pittsburgh and makes policy decisions under real financial, social, and infrastructure constraints.

The project combines real public data, live external signals, deterministic simulation, and AI resident agents:

```text

Public data + news

        ↓

Xtract ingestion / grounding

        ↓

Gemini Agent 1 — generate grounded event candidates

        ↓

Gemini Agent 2 — choose the daily slate

        ↓

Deterministic simulation — apply canonical effects

        ↓

Nemotron — resident reasoning and reactions

        ↓

PostgreSQL

        ↓

Frontend / city map / town hall / analytics

```

The core architecture rule is simple:

> **LLMs may interpret, select, explain, and react. They do not directly mutate canonical city state.**

The deterministic simulation engine and database remain the source of truth for treasury, rent, unemployment, transit, happiness, approval, and other gameplay values.

**---**

## Current Status

The backend vertical slice is connected and tested.

Current capabilities include:

- Pittsburgh baseline data from the U.S. Census Bureau ACS

- Pittsburgh municipal-finance baseline data

- RSS/Atom feed discovery

- General article ingestion and normalization

- Claude-powered Xtract signal extraction

- Evidence-grounding validation

- Persistent URL/content deduplication

- Decision-candidate generation

- Daily-world orchestration

- Gemini event-generation and event-selection boundaries

- Server-owned binding from generated events to authored simulation policies

- Deterministic turn resolution

- Before/after simulation snapshots

- Nemotron-compatible resident-reaction service

- Reaction persistence and retry safety

- API routes for game-day preparation, decisions, turn resolution, and outcomes

- PostgreSQL-backed city, neighborhood, resident, policy, decision, snapshot, game-day, and reaction state

Latest verification:

```text

Test Files: 10 passed

Tests:      107 passed

TypeScript: passed (npx tsc --noEmit)

```

The vertical-slice tests verify that:

1\. a saved Gemini-selected event can resolve through an authored policy,

2\. canonical state is updated by the deterministic simulation,

3\. committed before/after snapshots are passed to the reaction service,

4\. retries do not advance the turn twice or duplicate reactions,

5\. Nemotron failure does not roll back the simulation, and

6\. a later retry retries only reaction generation.

### Still in progress

- Real feed URLs still need to be configured in `lib/signals/feeds.ts`.

- The live Gemini + Nemotron provider path still needs a full smoke test with real credentials.

- Generated events are only playable when they can be safely bound to an authored deterministic policy.

- Frontend consumption of the new game-day/reaction APIs is not yet complete.

- Multi-day policy execution is not yet fully implemented; duration is currently planning metadata.

**---**

# Core Gameplay Loop

Each new game day is intended to run this pipeline:

```text

Player advances to a new day

        ↓

Check configured RSS/Atom feeds

        ↓

Process only unseen articles

        ↓

Extract source-grounded external signals

        ↓

Gemini Agent 1 produces up to 10 grounded event candidates

        ↓

Server validates evidence + executable policy bindings

        ↓

Gemini Agent 2 selects up to 5 decisions for the day

        ↓

Player chooses one

        ↓

Deterministic simulation resolves the authored policy

        ↓

Canonical state + snapshots are committed

        ↓

Nemotron receives the real before/after state

        ↓

Resident reactions are generated and persisted

        ↓

UI displays the result

```

There are no mandatory "required events." The daily slate is designed to contain up to five decisions of different scale and resource demand.

**---**

# Architecture

## 1. External Data / Xtract

External data has two jobs:

1\. establish the city's baseline state;

2\. continuously ground new gameplay events in real public information.

### Structured baseline data

The Census API layer currently includes:

- population

- median household income

- unemployment rate

- median gross rent

- median home value

- poverty rate

- rent-burden rate

- per-capita income

- labor-force participation rate

- homeownership rate

- vacancy rate

- mean commute time

- public-transit share

- average household size

Pittsburgh defaults:

```text

State FIPS: 42

Place FIPS: 61000

```

Example:

```bash

GET /api/city-data

GET /api/city-data?state=42&place=61000

```

The Census response includes source metadata, variable IDs, units, formulas, geography, and dataset period.

### Municipal finance baseline

The project also includes a Pittsburgh 2026 municipal-finance snapshot used as a stable scenario baseline.

Relevant code:

```text

lib/data/pittsburghFinance.ts

lib/data/snapshots/pittsburgh-finance-2026.json

```

### Feed/article ingestion

The automated external-signal path is:

```text

RSS / Atom

    ↓

lib/signals/adapters/rss.ts

    ↓

lib/signals/adapters/article.ts

    ↓

lib/signals/pipeline.ts

    ↓

lib/signals/extract.ts

    ↓

validated ExternalSignal

```

The feed layer:

- discovers article URLs,

- normalizes RSS/Atom entries,

- skips already processed URLs,

- parses article-like HTML,

- preserves provenance,

- isolates failures per article,

- avoids unnecessary Claude calls.

Deduplication uses normalized URLs, canonical URLs, content hashes, and a persistent attempt journal.

Run manually:

```bash

npm run ingest:feed

npm run ingest:feed -- --limit 3

```

Configure real feeds in:

```text

lib/signals/feeds.ts

```

**---**

## 2. Grounded Signal Extraction

Claude is currently used as the Xtract extraction model.

It converts cleaned public-source text into structured external signals such as:

- public-finance problems

- housing issues

- infrastructure problems

- employment changes

- policy proposals

- other city-relevant developments

Evidence validation remains strict:

- evidence quotes must match the normalized source text,

- source metadata is attached by code,

- unsupported evidence is rejected,

- malformed extraction output fails cleanly.

The model does **not** directly alter simulation numbers.

Relevant files:

```text

lib/signals/extract.ts

lib/signals/pipeline.ts

lib/signals/types.ts

```

**---**

## 3. Decision Candidates

Validated signals can be converted into decision candidates.

```text

ExternalSignal

    ↓

lib/signals/decisions.ts

    ↓

DecisionCandidate

```

Current deterministic candidate shape includes:

- source signal/document identity

- category

- title/problem

- optional proposed action

- supported benefits/risks

- affected groups

- urgency

- original source/evidence/provenance

- geography/event date/status

Build from existing extracted signals:

```bash

npm run build:decisions

```

Output:

```text

data/signals/decisions/

```

This deterministic layer remains useful for debugging and development even as the live game moves toward Gemini-generated playable events.

**---**

## 4. Gemini Agent 1 — Event Generator

Gemini Agent 1 is the game-facing interpretation layer.

Its job is to convert validated Xtract signals into up to **10 grounded playable event candidates**.

It may:

- combine related grounded signals,

- turn a real-world issue into a playable city decision,

- identify a problem,

- identify a proposed action,

- identify supported benefits and risks,

- identify affected groups,

- attach source/evidence lineage.

It may **not**:

- invent unsupported facts,

- invent canonical city-state changes,

- assign arbitrary treasury/rent/unemployment/happiness effects,

- bypass source validation.

Relevant files:

```text

lib/agents/gemini.ts

lib/signals/generated-events.ts

lib/signals/generate-event-candidates.ts

```

**---**

## 5. Gemini Agent 2 — Daily Selector

Gemini Agent 2 receives only the validated candidate pool produced by Agent 1.

It selects up to **5** decision IDs for the player to see that day.

Selection can consider:

- category diversity

- scale/resource diversity

- source diversity

- novelty

- current city context

- previously shown events

It does **not** rewrite candidates or invent new events.

Relevant file:

```text

lib/signals/select-events-with-gemini.ts

```

**---**

## 6. Executable Action Binding

Generated prose is not automatically executable.

A generated event must be bound server-side to an existing authored policy before it can affect the simulation.

```text

GeneratedEventCandidate

        ↓

database/simulation/bindExecutableActions.ts

        ↓

authored policy_id

        ↓

existing deterministic PolicyEffects

```

This prevents Gemini from inventing simulation effects.

For the current vertical slice, the tested executable path uses an authored transit policy.

Candidates that cannot be safely bound remain non-executable.

**---**

## 7. Deterministic Simulation Engine

The simulation engine is the sole authority for canonical numerical state.

It controls fields such as:

- treasury

- revenue

- expenses

- debt

- rent/housing

- unemployment

- transit

- happiness

- approval

- neighborhood state

- resident state

Core flow:

```text

snapshot N

→ load decisions for turn N

→ load authored policies

→ apply policy effects

→ recalculate neighborhood aggregates

→ recalculate city aggregates

→ persist residents/neighborhoods/city

→ write snapshot N+1

→ advance current_turn

```

Relevant files:

```text

database/simulation/applyPolicyEffects.ts

database/simulation/recalculateAggregates.ts

database/simulation/loadTurnState.ts

database/simulation/persistTurnState.ts

database/simulation/resolveTurn.ts

```

Turn resolution is transactional. If deterministic resolution fails, canonical state is rolled back.

**---**

## 8. Nemotron Resident Agents

Nemotron runs **after** deterministic simulation commits.

It receives:

- the selected grounded event,

- the authored policy,

- resident profile(s),

- before-state snapshot,

- after-state snapshot.

It can generate structured resident reactions such as:

```ts

interface ResidentReaction {

  residentId: string;

  support: number;

  sentiment: "positive" | "neutral" | "negative";

  reaction: string;

  mainReason: string;

}

```

Nemotron is intended for:

- resident reasoning

- support/sentiment

- town-hall dialogue

- heterogeneous socioeconomic reactions

Nemotron does **not** directly mutate canonical city state.

Relevant file:

```text

lib/agents/nemotron.ts

```

A Nemotron failure does not undo a resolved turn. Reaction generation can be retried independently.

**---**

# Game-Day Persistence

The game-day vertical slice adds persistent state for generated/selected events and resident reactions.

Relevant migration:

```text

database/supabase/migrations/20260919200000_game_day_vertical_slice.sql

```

Relevant gameplay services:

```text

database/gameplay/contracts.ts

database/gameplay/prepareGameDay.ts

database/gameplay/chooseGameDayCandidate.ts

database/gameplay/resolveGameDay.ts

```

The database remains the persistent source of truth for:

- current city state

- neighborhoods

- residents

- authored policies

- decisions

- simulation snapshots

- game-day candidate pools/slates

- player choice lineage

- resident reactions

**---**

# API

Important routes include:

```text

GET  /api/city-data

GET  /api/city/:id

GET  /api/city/:id/neighborhoods

GET  /api/city/:id/residents

GET  /api/policies

POST /api/city/:id/game-day

GET  /api/city/:id/game-day

GET  /api/city/:id/game-day/outcome

POST /api/city/:id/decisions

POST /api/city/:id/resolve-turn

```

The game-day API is designed to be idempotent:

```text

first request for city + turn

→ ingestion/model generation may run

→ result is persisted

same request again

→ persisted result returned

→ providers are not called again

```

**---**

# Local Daily-World Debug Pipeline

A deterministic local daily-world workflow also exists for development:

```bash

npm run build:daily-world

npm run build:daily-world -- --day 2 --limit 3

```

For a new day it performs:

```text

ingest feeds

→ build deterministic candidates

→ select local slate

→ persist local game-day JSON

```

Saved days are reused without rerunning ingestion.

Local outputs live under:

```text

data/signals/

├── documents/

├── extracted/

├── decisions/

└── game-days/

```

The local deterministic slate should not be confused with Gemini-generated gameplay output.

**---**

# Setup

## Requirements

- Node.js 22 LTS or another supported modern LTS

- npm

- PostgreSQL / Supabase-compatible Postgres

- internet access for external APIs

Install:

```bash

npm install

```

Copy environment variables:

```bash

cp .env.example .env.local

```

On PowerShell:

```powershell

Copy-Item .env.example .env.local

```

Typical environment configuration includes:

```env

DATABASE_URL=

CENSUS_API_KEY=

ANTHROPIC_API_KEY=

GEMINI_API_KEY=

GEMINI_MODEL=

NEMOTRON_BASE_URL=

NEMOTRON_API_KEY=

NEMOTRON_MODEL=

```

Never commit `.env.local` or API keys.

Run the application:

```bash

npm run dev

```

**---**

# Database

The simulation requires a direct PostgreSQL connection.

```env

DATABASE_URL=postgresql://...

```

Apply the migrations in:

```text

database/supabase/migrations/

```

and seed the game data using the existing database scripts.

Useful commands already provided by the repo may include:

```bash

npm run db:start

npm run db:status

npm run db:seed

npm run db:stop

```

The game-day vertical-slice migration must be applied before using the new persisted Gemini/Nemotron workflow.

**---**

# Tests

Run the unit/full normal suite:

```bash

npm test

```

Current verified result:

```text

10 test files passed

107 tests passed

```

Type-check:

```bash

npx tsc --noEmit

```

Core vertical-slice test:

```bash

npm test -- database/gameplay/__tests__/vertical-slice.test.ts

```

That test currently verifies:

- persisted Gemini selection

- executable policy binding

- deterministic resolution

- expected canonical state

- committed before/after snapshots

- post-commit resident reaction generation

- retry idempotency

- Nemotron failure isolation

- failed grounding behavior

**---**

# Important Design Rules

## The simulation owns numbers

Do:

```text

Gemini: "Expand transit access"

Simulation: authored deterministic effect

Nemotron: "This helps my commute, so I support it"

```

Do not:

```text

Gemini: "Transit +18, happiness +7, treasury -$3M"

```

unless those numbers came from the deterministic authored simulation contract.

## Ground everything

Generated events must retain traceability to:

```text

source article

→ validated Xtract signal

→ evidence quote

→ generated event

→ selected game-day decision

```

## Fail safely

- article failures do not stop the entire feed run

- duplicate articles do not trigger repeat Claude calls

- saved game days do not trigger repeat Gemini calls

- simulation retries do not double-advance turns

- Nemotron failures do not roll back canonical simulation state

- reaction retries do not rerun simulation

**---**

# Project Structure

High-level structure:

```text

app/

└── api/

    ├── city-data/

    └── city/[id]/

        ├── decisions/

        ├── game-day/

        └── resolve-turn/

components/

└── UI / map / resident / policy components

database/

├── gameplay/

├── lib/

├── simulation/

├── supabase/

└── types/

lib/

├── agents/

│   ├── gemini.ts

│   └── nemotron.ts

├── data/

│   ├── census.ts

│   └── pittsburghFinance.ts

└── signals/

    ├── adapters/

    │   ├── article.ts

    │   ├── html.ts

    │   └── rss.ts

    ├── extract.ts

    ├── pipeline.ts

    ├── ingest-feed.ts

    ├── generated-events.ts

    ├── generate-event-candidates.ts

    ├── select-events-with-gemini.ts

    ├── decisions.ts

    └── build-daily-world.ts

scripts/

├── ingest-signal.ts

├── ingest-feed.ts

├── build-decisions.ts

└── build-daily-world.ts

src/lib/

└── apiClient.ts

```

**---**

# Current Roadmap

The highest-priority next steps are:

1\. Configure several reliable Pittsburgh-relevant RSS/Atom feeds.

2\. Run one live Xtract → Gemini 1 → Gemini 2 smoke test.

3\. Complete a live Nemotron reaction smoke test through the Brev/NIM endpoint.

4\. Apply the game-day migration in the shared development database.

5\. Connect the frontend decision cards to the persisted game-day API.

6\. Replace connected-mode scripted resident reactions with persisted Nemotron reactions.

7\. Expand executable policy bindings beyond the initial tested transit action.

8\. Implement true multi-day policy/resource effects.

9\. Polish town hall, city map, source/evidence display, and analytics.

**---**

# Why State of Us?

Most city simulators reduce public policy to static modifiers.

State of Us is built around a different loop:

> **real-world information → grounded policy choices → deterministic consequences → residents who can explain how those consequences affect them differently**

The goal is not to let an LLM run the city.

The goal is to make a deterministic city simulation feel alive, explainable, and connected to the world outside the game.
