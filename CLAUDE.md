# CLAUDE.md

## Project Overview

Decision-Impact Fitness Tracker — a mobile-first Next.js web app that models how individual lifestyle decisions (diet, alcohol, sleep, exercise) cascade into body composition changes over time. Built for a single user (Zach) targeting a wedding on Sept 5, 2026. Not a calorie counter — an informed-choice tool with a cascading impact engine.

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **Database:** Neon serverless Postgres via Drizzle ORM (9 tables)
- **Health Data:** Fitbit Web API (OAuth 2.0 PKCE) — weight, BF%, sleep, steps, exercise, HR, HRV
- **AI:** Claude API for compound scenario analysis (backend route only)
- **Styling:** Tailwind CSS v4, dark palette (amber/teal accents), Outfit + DM Sans fonts
- **Deployment:** Vercel
- **PWA:** Hand-written service worker + IndexedDB offline queue

## Key Files & Directories

- `lib/engine/index.ts` — 14 pure engine functions (BMR, TDEE, EMA, cascading impacts)
- `lib/engine/constants.ts` — Targets, diet tiers, confidence levels, drink definitions
- `lib/engine/keywords.ts` — Local keyword parser for instant scenario responses
- `lib/engine/events.ts` — Builds event markers from DayRecord data
- `lib/db/schema.ts` — Drizzle schema (9 Postgres tables)
- `lib/db/queries.ts` — Query layer (getDayRecords, getDayLog, upserts, DayRecord type)
- `lib/db/index.ts` — `getDb()` serverless connection factory
- `lib/fitbit/client.ts` — `fitbitFetch()` with auto token refresh
- `lib/fitbit/sync.ts` — `syncFromFitbit()` for 6 health data types
- `lib/patterns/index.ts` — 8 behavioral pattern detectors
- `lib/offline-queue.ts` — IndexedDB queue for offline logging
- `components/Shell.tsx` — Bottom tab bar (5 tabs)
- `components/Trajectory.tsx` — Canvas-rendered organic trajectory visualization
- `components/ui/*` — Design system primitives (Card, Pill, Btn, Label)
- `app/(tabs)/` — Tab pages (dashboard, impact, log, weekly, settings)
- `app/api/` — 14 API routes (dashboard, export, fitbit/*, impact/*, logs/*, weekly)

## Architecture

Three-layer intelligence model:
1. **Layer 1 (Engine):** Deterministic energy balance — BMR, TDEE, deficit math (pure functions)
2. **Layer 2 (Engine):** Body composition modeling — cascading impact chains with [lo, hi] range preservation (pure functions)
3. **Layer 3 (Claude API):** Compound scenario analysis via `/api/impact/analyze` with 3s timeout and local fallback

Engine functions live in `lib/engine/` with zero React or DB imports — only type imports. Testable anywhere.

**Fat server / thin client:** API routes compute everything; client components just fetch + render.

## Design Principles

- **Context over judgment** — show costs, let the user decide
- "Letting loose" is a valid input, not a failure state
- Model recovery from deviation, not just the deviation
- Balance > perfection; celebrate 4/7 good days over streaks
- Diet logging uses a 5-tier quality scale (not calorie counting)
- Cascading chains, not parallel sums — alcohol→sleep→hunger→balance
- Forward framing — recovery paths, not blame
- Confidence tiers on all outputs (🟢 Well-established / 🟡 Evidence-supported / 🔴 Plausible)

## Commands

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # Production build — 23 routes, zero errors expected
npm test             # Vitest — 29 tests (cascade + keyword parser)
npx drizzle-kit push # Push schema to Neon Postgres
```

## Key Patterns

- **Local date math:** Never `toISOString().split("T")` — always manual `getFullYear/getMonth/getDate`
- **Serverless DB:** `getDb()` creates fresh Drizzle instance per call (no module-level pool)
- **Idempotent upserts:** Health tables keyed on `(date, source)`, diet/alcohol on `(date)` only
- **Log card lifecycle:** Each card self-manages fetch/save with `onSaved` callback
- **Offline queue:** IndexedDB + dual drain (Background Sync API + `online` event for iOS)

## Environment Variables

Required in `.env.local` (or Vercel env):
- `DATABASE_URL` — Neon Postgres connection string
- `FITBIT_CLIENT_ID` — Fitbit API app client ID
- `FITBIT_CLIENT_SECRET` — Fitbit API app client secret

Claude AI:
- `ANTHROPIC_API_KEY` — Claude API key (required for "Ask Anything" feature; OAuth tokens are not supported by the Messages API)

If no API key is set, the impact analyzer degrades gracefully to the local keyword parser.

## Historical Files (POC)

- `app.jsx` — Original single-file React POC (Claude artifact). Engine ported to `lib/engine/`.
- `prd_fitness_tracker.md` — Original PRD. Requirements now tracked in `.gsd/REQUIREMENTS.md`.
- `architecture_doc.md` — Original architecture doc. Superseded by actual implementation.
