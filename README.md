# CityPulse — Pittsburgh AI City Management Game

A SimCity-style AI city management game set in Pittsburgh, Pennsylvania. Shape your city through housing, transit, tax, safety, business, and environment policies — and watch how Pittsburgh's real neighborhoods respond.

![CityPulse Screenshot](./public/screenshot.png)

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Animations | Framer Motion |
| City Map | **PixiJS v8** (dynamically imported, SSR-disabled) |
| Analytics | Recharts |
| Fonts | Inter + Press Start 2P (Google Fonts) |

## City Map Library

**PixiJS v8** is used for the isometric city map. Both PixiJS and Phaser reference `window` at module scope, which breaks Vercel's SSR prerendering with `ReferenceError: window is not defined`. This is fixed with:

```tsx
const CityCanvas = dynamic(
  () => import('@/components/map/CityCanvas'),
  { ssr: false, loading: () => <MapSkeleton /> }
)
```

The interactive map uses HTML Canvas 2D and a local illustrated sprite atlas (`public/sprites/city-atlas.png`). Individual buildings are layered over streets, parks, animated rivers, and stone waterfronts; pan, zoom, neighborhood selection, and policy project visuals remain interactive.

## Local Setup

```bash
git clone <repo>
cd citypulse
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build   # must pass with zero type errors
npm run start   # production server
```

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/citypulse)

1. Connect your repository on vercel.com
2. No environment variables required for the mock layer
3. Add real API keys from `.env.example` to Vercel's environment settings when ready

## Architecture

```
Frontend (Next.js)
│
├── app/           ← Next.js App Router pages + layout
├── lib/           ← ALL game logic (no UI here)
│   ├── types.ts       ← Full data model (City, Neighborhood, Resident, Policy, etc.)
│   ├── mockData.ts    ← Pittsburgh seed data
│   ├── mockEngine.ts  ← simulateTurn(), enactPolicy(), rollEvent()
│   ├── mockAgents.ts  ← Stubbed Nemotron: getAgentReasoning()
│   └── store.ts       ← Zustand: all game state + turn interval
│
└── components/
    ├── layout/    ← GameDashboard, TopBar, BottomPanel
    ├── sidebar/   ← LeftSidebar, RightSidebar, CategoryNav, MiniMap
    ├── map/       ← CityCanvas (PixiJS), MapSkeleton
    ├── ui/        ← Avatar, PolicyCard, Toast
    └── modals/    ← All 6 modal/drawer components
```

## Swapping in the Real Backend

The mock layer is the integration seam. To wire in real Nemotron, Supabase, and the simulation backend:

| File | What to replace |
|---|---|
| `lib/mockAgents.ts` | `getAgentReasoning()` → call Nemotron API |
| `lib/mockEngine.ts` | `simulateTurn()` → call backend `/api/simulate` |
| `lib/mockData.ts` | Seed data → load from Supabase on mount |
| `lib/store.ts` | `setInterval` → keep as-is OR switch to Supabase Realtime |

All other components are presentational and stay unchanged.

## Pittsburgh Neighborhoods

| Neighborhood | Income Tier | Key Tension |
|---|---|---|
| Shadyside | Higher (gold) | Tree-lined streets, Walnut St retail |
| Lawrenceville | Middle (blue) | Rapid gentrification, displacement pressure |
| Homewood | Lower (red) | High vacancy, transit dependence, disinvestment |
| Oakland | Middle | Ed+med hub, 68% tax-exempt land |
| Golden Triangle | Higher | Downtown CBD, the Point |
| Mount Washington | Middle | Hillside risk, inclines |
| Hill District | Lower | Adjacent to downtown, August Wilson |
| Strip District | Middle | Warehouse tech corridor |
| South Side Flats | Middle | Carson St bar scene |
| Hazelwood | Lower | Mon Valley, coke works legacy |

## Known Simplifications

- **Map art combines illustrated sprites and canvas terrain** — 16 local building and landscaping illustrations, with procedural streets, bridges, water, and street details. Geography is stylized rather than geographically exact.
- **ElevenLabs speaker button** is visually wired but silent. Set `ELEVENLABS_API_KEY` to enable.
- **Nemotron responses** are hardcoded per archetype in `mockAgents.ts`. Same output shape as real Nemotron.
- **No auth, no settings panel, no dark/light toggle** — out of scope per spec.
- **Mobile layout** is not optimized — game is designed for 1280px+ screens.

## Pittsburgh Context

CityPulse is grounded in real Pittsburgh tensions:
- **42% of assessed property value** is tax-exempt (Pitt, CMU, UPMC)
- **446 bridges** — more per capita than any U.S. city; many rated structurally deficient
- **The Three Sisters** — three parallel yellow suspension bridges over the Allegheny
- **The PILOT fight** — the single most Pittsburgh-specific policy in the game
- **Hillside landslides** — 23 neighborhoods on unstable slopes
- **The displacement loop** — transit investment → property value → rent → longtime-renter unhappiness
