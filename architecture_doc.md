# Architecture Document: Momentum

*Current state: Production web app deployed on Vercel*

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                        │
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐ │
│  │  Home   │ │ Impact  │ │   Log   │ │ Summary │ │ Progress │ │
│  │(dashbd) │ │(ask/cmp)│ │(5 cards)│ │(weekly) │ │ (photos) │ │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬─────┘ │
│       │           │           │            │            │        │
│  ┌────┴───────────┴───────────┴────────────┴────────────┴────┐  │
│  │              SHARED COMPONENTS                             │  │
│  │  Card · Pill · Btn · Label · Markdown · Trajectory ·      │  │
│  │  EventCard · ConfBadge · Shell (tab bar)                   │  │
│  └────┬───────────┬───────────┬──────────────────────────────┘  │
│       │           │           │                                  │
├───────┴───────────┴───────────┴──────────────────────────────────┤
│                       INTELLIGENCE LAYER                         │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │  Engine (Layer 1+2)  │  │  Claude Agent SDK (Layer 3)      │ │
│  │                      │  │                                  │ │
│  │  bmr() · tdee()      │  │  MCP Fitness Tools:              │ │
│  │  ema() · sma()       │  │  - get_today_data                │ │
│  │  derivedPace()       │  │  - get_recent_days               │ │
│  │  projectedWeight()   │  │  - get_weight_trend              │ │
│  │  alcoholImpact()     │  │  - calculate_impact              │ │
│  │  sleepImpact()       │  │                                  │ │
│  │  exerciseImpact()    │  │  Multi-turn: Claude queries      │ │
│  │  dietImpact()        │  │  data, then answers              │ │
│  │  scenarioImpact()    │  │                                  │ │
│  │  checkMilestones()   │  │  Vision: base64 photo analysis   │ │
│  │                      │  │  via generator prompt             │ │
│  │  Pure functions.     │  │                                  │ │
│  │  No side effects.    │  │  Auth: Claude Max OAuth          │ │
│  │                      │  │  (dev) or API key (production)   │ │
│  └──────────┬───────────┘  └──────────────┬───────────────────┘ │
│             │                              │                     │
│  ┌──────────┴──────────────────────────────┴─────────────────┐  │
│  │  Local Keyword Parser (fallback)                           │  │
│  │  parseQuery() — regex routing for single-factor queries    │  │
│  │  Multi-value extraction for alcohol comparisons            │  │
│  │  Routes contextual queries ("today's workout") to Claude   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                         DATA LAYER                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Neon Postgres (via Drizzle ORM)                         │   │
│  │                                                           │   │
│  │  10 tables:                                               │   │
│  │  weight_logs · sleep_logs · activity_logs ·               │   │
│  │  heart_rate_logs · diet_logs · alcohol_logs ·             │   │
│  │  fitbit_tokens · sync_history · scenarios ·               │   │
│  │  config · photos                                          │   │
│  │                                                           │   │
│  │  Key: (date, source) for health tables                    │   │
│  │  Manual + Fitbit sources coalesced in queries             │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │                                        │
│  ┌──────────────────────┴───────────────────────────────────┐   │
│  │  External Services                                        │   │
│  │                                                           │   │
│  │  Fitbit Web API — weight, BF%, sleep, steps, exercise,    │   │
│  │                   HR, HRV (OAuth 2.0 PKCE)                │   │
│  │  Vercel Blob — progress photo storage (private)           │   │
│  │  Claude — Agent SDK + MCP tools (Max OAuth or API key)    │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## API Routes (28 total)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/dashboard` | GET | Assembles all dashboard data server-side |
| `/api/weekly` | GET | Week-over-week stats, day-by-day breakdown |
| `/api/weekly/analysis` | GET | Claude momentum analysis (cached daily) |
| `/api/impact/analyze` | POST | Ask Anything — Claude with MCP tools |
| `/api/impact/scenarios` | GET/POST/DELETE | Saved scenario CRUD |
| `/api/logs/diet` | GET/POST | Diet log read/write |
| `/api/logs/alcohol` | GET/POST | Alcohol log read/write |
| `/api/logs/weight` | GET/POST | Weight log read/write |
| `/api/logs/sleep` | GET/POST | Sleep log read/write |
| `/api/logs/exercise` | GET/POST | Exercise log read/write |
| `/api/photos` | GET/POST/DELETE | Photo upload, list, delete |
| `/api/photos/serve` | GET | Proxy private blob images |
| `/api/photos/analyze` | POST | Claude vision photo analysis |
| `/api/fitbit/authorize` | GET | OAuth initiation |
| `/api/fitbit/callback` | GET | OAuth code exchange |
| `/api/fitbit/sync` | POST | Pull data from Fitbit API |
| `/api/fitbit/status` | GET | Connection status |
| `/api/export` | GET | Full data export |

---

## Claude Integration Architecture

### Three entry points for Claude:

1. **Ask Anything** (`/api/impact/analyze`)
   - Multi-turn with MCP fitness tools (maxTurns: 5)
   - Claude queries user data via tools before answering
   - Philosophy-driven system prompt (context > judgment, forward framing)
   - Local keyword parser as offline fallback
   - 60s timeout

2. **Momentum Analysis** (`/api/weekly/analysis`)
   - Coach-between-rounds debrief
   - Returns structured JSON: insights[], quietWin, oneThing, momentum status
   - Icon keys from fixed palette (gym, sleep, food, drinks, scale, fire, target, warning, heart, clock, trophy, run)
   - Cached daily

3. **Photo Analysis** (`/api/photos/analyze`)
   - Fetches private blob images server-side → base64
   - Passes images via Agent SDK generator prompt
   - Claude sees actual photos + pulls fitness data via MCP tools
   - Visual comparison between check-in dates

### MCP Fitness Tools (in-process server)

Defined in `lib/claude/fitness-tools.ts`, runs in the same Node.js process as the API route:

| Tool | Purpose |
|------|---------|
| `get_today_data` | Full DayLog for today (exercise, sleep, diet, weight, steps, HR) |
| `get_recent_days` | DayRecords for last N days (1-30) |
| `get_weight_trend` | Latest weight, 7-day SMA, BF%, pace, TDEE, milestones |
| `calculate_impact` | Engine impact functions (alcohol, sleep, exercise, diet) |

### Auth (temporary dev hack)

- **Local dev:** Agent SDK reads `~/.claude/.credentials.json` (CLI auto-refreshes)
- **Vercel:** `CLAUDE_CREDENTIALS_JSON` env var with auto-refresh via `lib/claude/credentials.ts`
- **Token TTL:** ~4 hours. `scripts/refresh-vercel-token.sh` pushes fresh creds every 3 hours
- **Production:** Should use `ANTHROPIC_API_KEY` instead (documented in CLAUDE.md)

---

## Key Architectural Patterns

- **Fat server / thin client:** API routes compute all state. Client components fetch and render.
- **Timezone-aware dates:** All server-side "today" uses `lib/date-utils.ts` (America/Los_Angeles). Vercel runs UTC.
- **Serverless DB:** `getDb()` creates a fresh Drizzle instance per call (no module-level pool).
- **Idempotent upserts:** Health tables keyed on `(date, source)`. Manual + Fitbit sources coalesced via COALESCE joins.
- **Fitbit sync window:** Always covers at least 7 days to catch exercise reclassification on re-sync.
- **Photo serving:** Private Vercel Blob → `/api/photos/serve` proxy route (streams with server-side auth).
- **Markdown rendering:** All Claude responses rendered via `components/ui/Markdown.tsx` (react-markdown with themed components).

---

## Evidence Tables (Engine Layer 2)

### Alcohol — 3 tiers only (no granularity above 6 drinks)

| Drinks | Fat Ox Suppression | MPS Impact | Recovery | Confidence |
|--------|-------------------|------------|----------|------------|
| 1-2 | 20-40%, 4-6h | Likely minimal | ~12h | 🟡 |
| 3-5 | 50-70%, 6-8h | 10-20% ↓ | 24-36h | 🟡 |
| 6+ | 73-79%, 8h+ | 24-37% ↓ | 48-72h | 🟢 |

### Sleep — 4 tiers

| Hours | Fat:Muscle Ratio | Hunger ↑ | MPS | Confidence |
|-------|-----------------|----------|-----|------------|
| 8+ | 50-60% fat | Baseline | Baseline | 🟢 |
| 7-8 | 40-50% fat | +100-200 kcal | Modest ↓ | 🟡 |
| 5.5-7 | 20-35% fat | +300-450 kcal | -18% | 🟢 |
| <5.5 | 10-25% fat | +400-600 kcal | Significant ↓ | 🟡 |

### Diet — 5-tier Vibes scale

| Score | Name | kcal Delta | Confidence |
|-------|------|-----------|------------|
| 1 | Dumpster Fire | +800 to +1200 | 🟢 |
| 2 | Meh | +200 to +500 | 🟢 |
| 3 | Cruise Control | -200 to +200 | 🟢 |
| 4 | Dialed In | -500 to -300 | 🟢 |
| 5 | Sniper Mode | -700 to -500 | 🟢 |

### Cascading Chains

```
Alcohol (3-5 drinks) → degrades effective sleep by 1.0-1.5h
Alcohol (6+ drinks) → degrades effective sleep by 1.5-2.0h
Poor sleep (<7h effective) → increases hunger → shifts diet score down
Exercise → independent of cascade
```

---

## Historical Context

This architecture evolved from a single-file React POC (`app.jsx`) that ran as a Claude artifact. The POC validated the decision-impact concept through daily use. The web app preserves the engine's pure functions and evidence tables while adding:

- Real Fitbit integration (replacing manual Health Connect reads)
- Postgres persistence (replacing Claude's `window.storage` KV)
- Multi-turn Claude conversations with data tool access
- Vision-based photo analysis
- Structured momentum reports
- Zoomable trajectory with confidence bands
- PWA support for mobile home screen
