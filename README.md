# Momentum

A mobile-first web app that shows how lifestyle decisions build or break momentum toward body composition goals. Built for one user (Zach) targeting a wedding on Sept 5, 2026.

Not a calorie counter. A decision-impact tool with a cascading engine.

> You are a whole, complicated, weird person. We give you the context to live your life the way you want to, not to judge.

## What It Does

- **Log quickly** — Diet (one-tap 5-tier Vibes scale or per-meal text), alcohol (tap counter with additive sessions), weight, sleep, exercise. All under 60 seconds on mobile.
- **See the trajectory** — Organic canvas-rendered river band showing your EMA-smoothed weight trend flowing toward target dates (Bachelor Party Aug 20, Wedding Sep 5). Decision markers show where choices bent the curve.
- **Ask "What if?"** — 4 preset head-to-head comparisons + free-text queries. Local keyword engine for instant responses, Claude API for compound scenarios. Cascading chains (alcohol→sleep→hunger→balance), not parallel sums.
- **Get nudged** — 8 behavioral pattern detectors surface the top 3 insights on your dashboard (weekend alcohol concentration, training gaps, diet drop-off, sleep trends, plateaus, etc.).
- **Track weekly** — Week-over-week stat deltas, day-by-day breakdown, logging consistency score, AI-generated momentum analysis.
- **Progress photos** — Front/side check-in photos stored in Vercel Blob with Claude vision analysis comparing changes over time.

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Database | Neon serverless Postgres (Drizzle ORM, 10 tables) |
| Health Data | Fitbit Web API (OAuth 2.0 PKCE) |
| AI | Claude Agent SDK with MCP tools (multi-turn data queries + vision) |
| Photo Storage | Vercel Blob (private) |
| Styling | Tailwind CSS v4, dark palette, Outfit + DM Sans |
| Deployment | Vercel |
| Mobile | PWA (service worker + IndexedDB offline queue) |

## Getting Started

### Prerequisites

- Node.js 18+
- A Neon Postgres database
- A Fitbit developer app (for OAuth)
- An Anthropic API key (optional — app degrades gracefully)

### Setup

```bash
npm install
```

Create `.env.local`:

```
DATABASE_URL=postgresql://...
FITBIT_CLIENT_ID=...
FITBIT_CLIENT_SECRET=...
ANTHROPIC_API_KEY=...          # optional — for production Claude access
BLOB_READ_WRITE_TOKEN=...     # optional — for progress photo uploads
```

Push the database schema:

```bash
npx drizzle-kit push
```

### Run

```bash
npm run dev        # Dev server on http://localhost:3000
npm run build      # Production build (23 routes)
npm test           # 29 Vitest tests (cascade engine + keyword parser)
```

## Architecture

```
Client (5 tabs)          API Routes (14)         External
┌──────────────┐    ┌──────────────────┐    ┌──────────┐
│ Dashboard    │───→│ /api/dashboard   │───→│ Neon     │
│ Impact       │───→│ /api/impact/*    │───→│ Postgres │
│ Log (5 types)│───→│ /api/logs/*      │    └──────────┘
│ Weekly       │───→│ /api/weekly      │    ┌──────────┐
│ Progress     │───→│ /api/photos/*    │───→│ Vercel   │
│ Settings     │───→│ /api/fitbit/*    │───→│ Blob     │
│              │    │                  │    │ Fitbit   │
└──────────────┘    │ /api/export      │    │ API      │
                    └──────────────────┘    └──────────┘
                           │                ┌──────────┐
                    Engine (14 pure fns)    │ Claude   │
                    No React/DB imports     │ API      │
                    Cascading chains        └──────────┘
```

**Three-layer intelligence:**
1. **Layer 1:** Deterministic energy balance — BMR, TDEE, deficit math (pure functions)
2. **Layer 2:** Body composition modeling — cascading impact chains with [lo, hi] ranges (pure functions)
3. **Layer 3:** Claude Agent SDK with MCP fitness tools — multi-turn data queries, vision-based photo analysis, momentum reports. Local keyword parser as offline fallback.

**Fat server, thin client:** API routes compute all state. Client components fetch and render.

## Key Design Decisions

- **Cascading, not parallel** — Alcohol disrupts sleep → degraded sleep increases hunger → hunger shifts diet quality → diet shifts energy balance. Each link preserves uncertainty ranges.
- **Vibes, not calories** — One-tap 5-tier quality scale. Research shows simplified tracking achieves equivalent weight loss with nearly double the adherence rate.
- **Forward framing** — Recovery paths, not blame. "Could undo 3-4 clean days" not "you ruined your progress."
- **Confidence tiers** — Every output tagged 🟢 Well-established / 🟡 Evidence-supported / 🔴 Plausible but uncertain.
- **Single user** — No auth layer, no multi-tenancy. Fitbit OAuth is for API access, not identity.

## Project Documentation

Detailed project state, requirements, and decisions live in `.gsd/`:

- `.gsd/PROJECT.md` — Current project state
- `.gsd/REQUIREMENTS.md` — Capability contract (29 requirements)
- `.gsd/DECISIONS.md` — Architectural decision register
- `.gsd/KNOWLEDGE.md` — Patterns and lessons learned

Historical POC files (`app.jsx`, `prd_fitness_tracker.md`, `architecture_doc.md`) are preserved in the repo root but superseded by the implementation.
