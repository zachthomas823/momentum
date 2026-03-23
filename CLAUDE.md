# CLAUDE.md

## Project Overview

Momentum — a mobile-first Next.js web app that shows how lifestyle decisions build or break momentum toward body composition goals. Built for a single user (Zach) targeting a wedding on Sept 5, 2026. Not a calorie counter — a decision-impact tool with a cascading engine.

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **Database:** Neon serverless Postgres via Drizzle ORM (10 tables)
- **Health Data:** Fitbit Web API (OAuth 2.0 PKCE) — weight, BF%, sleep, steps, exercise, HR, HRV
- **AI:** Claude Agent SDK with MCP fitness tools (multi-turn data queries + vision photo analysis)
- **Photo Storage:** Vercel Blob (private) with proxy serving via `/api/photos/serve`
- **Styling:** Tailwind CSS v4, dark palette (amber/teal accents), Outfit + DM Sans fonts
- **Deployment:** Vercel
- **PWA:** Hand-written service worker + IndexedDB offline queue

## Key Files & Directories

- `lib/engine/index.ts` — 14 pure engine functions (BMR, TDEE, EMA, cascading impacts)
- `lib/engine/constants.ts` — Targets, diet tiers, confidence levels, drink definitions
- `lib/engine/keywords.ts` — Local keyword parser for instant scenario responses
- `lib/engine/events.ts` — Builds event markers from DayRecord data
- `lib/claude/credentials.ts` — Claude OAuth credential management (auto-refresh)
- `lib/claude/fitness-tools.ts` — MCP server with 4 data query tools for Claude
- `lib/date-utils.ts` — Timezone-aware date helpers (America/Los_Angeles)
- `lib/db/schema.ts` — Drizzle schema (10 Postgres tables incl. photos)
- `lib/db/queries.ts` — Query layer (getDayRecords, getDayLog, upserts, DayRecord type)
- `lib/db/index.ts` — `getDb()` serverless connection factory
- `lib/fitbit/client.ts` — `fitbitFetch()` with auto token refresh
- `lib/fitbit/sync.ts` — `syncFromFitbit()` for 6 health data types
- `lib/patterns/index.ts` — 8 behavioral pattern detectors
- `lib/offline-queue.ts` — IndexedDB queue for offline logging
- `components/Shell.tsx` — Bottom tab bar (5 tabs: Home, Impact, Log, Summary, Progress)
- `components/Trajectory.tsx` — Zoomable canvas trajectory (day/week/month) with confidence bands
- `components/ui/*` — Design system primitives (Card, Pill, Btn, Label, Markdown)
- `app/(tabs)/` — Tab pages (dashboard, impact, log, weekly, progress)
- `app/api/` — API routes (dashboard, export, fitbit/*, impact/*, logs/*, weekly/*, photos/*)

## Architecture

Three-layer intelligence model:
1. **Layer 1 (Engine):** Deterministic energy balance — BMR, TDEE, deficit math (pure functions)
2. **Layer 2 (Engine):** Body composition modeling — cascading impact chains with [lo, hi] range preservation (pure functions)
3. **Layer 3 (Claude Agent SDK):** Multi-turn conversations via MCP fitness tools — Claude queries the user's actual data before answering. Vision-based photo analysis. Momentum reports on Summary page. Local keyword parser as offline fallback.

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
npm run build        # Production build — 28 routes, zero errors expected
npm test             # Vitest — 29 tests (cascade + keyword parser)
npx drizzle-kit push # Push schema to Neon Postgres
```

## Key Patterns

- **Timezone:** All server-side "today" uses `lib/date-utils.ts` (America/Los_Angeles) — Vercel runs UTC
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

Claude AI (choose one):
- `ANTHROPIC_API_KEY` — Claude API key for production use (recommended for any real deployment)
- `CLAUDE_CREDENTIALS_JSON` — **DEV HACK**: Full JSON from `~/.claude/.credentials.json` for Claude Max OAuth. Auto-refreshes expired tokens via `https://platform.claude.com/v1/oauth/token`. Tokens expire every ~4 hours; refresh tokens may be rotated by the local CLI. This is a temporary workaround for development — any real release should use `ANTHROPIC_API_KEY`.
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob Storage token (required for progress photo uploads)

If no Claude auth is configured, the impact analyzer degrades gracefully to the local keyword parser.

## Historical Files (POC)

- `app.jsx` — Original single-file React POC (Claude artifact). Engine ported to `lib/engine/`.
- `prd_fitness_tracker.md` — Original PRD. Requirements now tracked in `.gsd/REQUIREMENTS.md`.
- `architecture_doc.md` — Original architecture doc. Superseded by actual implementation.
