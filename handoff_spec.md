# Web App Handoff Spec
*Everything needed to build the fitness tracker web app from the POC*

**POC Status:** Phase 4 complete. All phases (0-4) built and tested in Claude artifact.
**Target:** Hand to Claude Code / development environment for web app build.

---

## What to Build

A mobile-first fitness tracking web app that shows how lifestyle decisions affect body composition trajectory. Not a calorie counter. An informed-choice tool with a decision-impact engine.

**Core loop:** Log data → see it on the trajectory → understand the impact → make informed choices.

---

## Screens

### 1. Dashboard (Home)

**Header:** "{N} days to walk in looking better than everyone."

**Milestone celebrations:** Gradient card at top when weight crosses thresholds (205, 200, 202.6 all-time lean, bachelor party weight, wedding weight). Shows icon + label.

**Countdown cards:** Two side-by-side — Bachelor Party (Aug 20, 2026) and Wedding (Sep 5, 2026) with day counts.

**Trajectory visualization:** Horizontally scrollable canvas. 7-day window (configurable), 130px per day column. Past days show actual weight data points (amber dots with glow + labels). EMA trend line (α=0.15) connects them. Projected band extends 3 days into the future using derived pace rate, widening with uncertainty. Target weight shown as dashed teal line. Y-axis auto-scales to data range.

**Pace pill:** Dynamic — "Ahead of pace" (teal, >0.7 lbs/wk), "On pace" (teal, >0.3), "Slow" (amber, >0), "Stalled" (rose, ≤0). Derived from EMA-smoothed weight trend, not hardcoded.

**Stat cards:** Weight (current + target) and Body Fat (current + target).

**Weekly scorecard:** 4 columns — Strength (sessions/3), Diet Log (days/7), Drink Days, Sleep Avg. Color coded: teal=good, gold=okay, rose=bad.

**Pattern nudges:** Top 3 from `Patterns.detectAll()`. Cards with colored left border (rose=alert, amber=warning, sky=nudge, teal=positive). 8 detection types — see Engine Spec below.

**Pace projection card:** Shows derived pace rate from EMA trend, estimated TDEE from step data, contextual messaging about drinking patterns.

### 2. Log

**Date selector:** 7-day row at top. Today pre-selected (amber highlight). Tap any past day to switch context. Blue banner when logging for a past date.

**Diet card:** Toggle between Vibes (5-level emoji scale) and Meals (4 text inputs). Persists selection on save. Shows "Logged" pill and "Diet Logged — Update Log" button when data exists.

**Alcohol card:** +/- drink counter, type selector (Beer/Wine/Liquor/Cocktail), additive sessions (log 2 beers now, 2 cocktails later). Running session summary with timestamps. "Dry day — log it" as positive action. Swaps to "Reset to dry day" after drinks logged.

**Weight card:** Two fields — lbs (required), BF% (optional). Number inputs with decimal keyboard.

**Sleep card:** Single hours field with inline feedback: teal "Optimal" at 8+, neutral at 7+, rose below 7, red below 5.5.

**Exercise card:** Three-way type toggle (Strength/Run/Walk) + duration in minutes.

All cards: load existing data on date switch, "Logged" pill when saved, button changes to "[Type] Logged — Update", same save/persist/feedback pattern.

**Storage keys:** `diet:{date}`, `alcohol:{date}`, `weight:{date}`, `sleep:{date}`, `activity:{date}`.

### 3. Impact (Decision-Impact Engine)

**Quick Scenarios:** 4 preset head-to-head comparisons. Tap to run `Engine.compareNarrative()`. Results show directional arrows (angled by impact severity), "clean days equivalent" framing, mechanism chains, confidence tiers. No point-estimate weights.

**Ask Anything:** Free-text input. POC uses local keyword-parsed engine (instant). Web app should route through Claude API backend for compound queries, with local engine as instant fallback.

**Saved Scenarios:** Persisted list below input. Swipe-left to delete. Long-press for multi-select mode with batch delete. Newest first. Timestamps.

### 4. Weekly Summary

**Week-over-week comparison:** 5 stat rows (Weight, Sleep, Strength, Drink Days, Diet Avg) showing this week vs previous 7 days. Green delta = improving, rose = declining.

**Day-by-day breakdown:** Cards for each of last 7 days showing all logged signals. Empty days at 50% opacity.

**Logging consistency:** Big number (days/7) with color-coded messaging.

### 5. Progress (Stub in POC)

Photo check-in management. Web app features: camera capture, ghost overlay alignment for consistent framing, side-by-side comparisons, photos paired with weight/BF% data from the same date. Check-ins every 2 weeks per coaching plan.

### 6. Settings

**Targets display:** Bachelor party and wedding weight/date targets.

**Data Sources:** Health Connect connection status, last sync timestamp, days synced, manual refresh button that re-syncs and reloads all views.

**Philosophy statement:** "You are a whole, complicated, weird person..."

**Export:** JSON dump of all persistent storage to clipboard.

---

## Engine Spec

### Layer 1: Energy Balance (Pure Functions)

```
Engine.bmr(weightLbs, heightIn, age)
  → Mifflin-St Jeor: 10 × kg + 6.25 × cm − 5 × age − 5
  
Engine.tdeeEstimate(bmr, avgSteps)
  → Activity multiplier: >12k=1.55, >8k=1.45, >5k=1.35, else 1.25

Engine.ema(values, alpha=0.15)
  → Exponential moving average for weight smoothing

Engine.derivedPace(days)
  → EMA-smoothed weight trend → weekly loss rate
  → Returns { rate, source, confidence, dataPoints }
  → Needs 2+ weight points, 3+ days span

Engine.tdeePipeline(currentWeight, days)
  → Connects BMR → steps avg → TDEE estimate
  → Returns { bmr, tdee, avgSteps }

Engine.projectedWeight(currentLbs, weeklyLossRate, weeksOut)
  → { center, low, high } with ±0.3 lbs/week uncertainty

Engine.checkMilestones(currentWeight)
  → Checks against thresholds: 205, 202.6 (all-time lean), 200 (BP target), 196 (wedding)
  → Returns array of { icon, label }
```

### Layer 2: Impact Modifiers

**Alcohol** — `Engine.alcoholImpact(drinkCount)`:

| Drinks | Fat Ox Suppression | MPS | Scale Impact | Recovery | Trajectory Shift |
|---|---|---|---|---|---|
| 1-2 | 20-40%, 4-6h | Minimal | +0.3-0.8 lbs | ~12h | +0.03-0.08 lbs/wk |
| 3-5 | 50-70%, 6-8h | 10-20% ↓ | +1.0-2.5 lbs | 24-36h | +0.1-0.25 lbs/wk |
| 6+ | 73-79%, 8h+ | 24-37% ↓ | +2-5 lbs | 48-72h | +0.3-0.55 lbs/wk |

**Sleep** — `Engine.sleepImpact(hours)`:

| Hours | Fat:Muscle Ratio | Hunger kcal ↑ | MPS |
|---|---|---|---|
| 8+ | 50-60% fat | Baseline | Baseline |
| 7 | 40-50% fat | +100-200 | Modest ↓ |
| 5.5 | 20-35% fat | +300-450 | -18% |
| <5 | 10-25% fat | +400-600 | Significant ↓ |

**Exercise** — `Engine.exerciseImpact(type, durationMin)`:
- Strength: ~6.5 kcal/min, 30-60 EPOC, MPS elevated 24-36h
- Running: ~10 kcal/min, 15-30 EPOC, minimal MPS

**Diet** — `Engine.dietImpact(score)`:
- Maps Vibes 1-5 to kcal delta ranges (1=+800-1200, 5=-700-500)

**Scenario comparison** — `Engine.scenarioImpact(scenario)` + `Engine.compareNarrative(a, b)`:
- Classifies direction: accelerates/helps/neutral/slows/stalls
- Outputs "clean days equivalent" (shift / 0.07 lbs/day)
- No point-estimate weights

### Pattern Detection — `Patterns.detectAll(days)`

8 detectors, priority-sorted:

| # | Pattern | Priority | Trigger |
|---|---|---|---|
| 1 | Weekend alcohol concentration | 1 | Fri-Sun drinks > 1.5× weekday |
| 2 | Training frequency gap | 2-3 | <3 strength sessions in 7 days |
| 3 | Weekend diet drop-off | 2 | Weekend avg < 2.5 when weekday avg ≥ 3.5 |
| 4 | Sleep trend | 2-4 | 7-day avg < 7h or 2+ nights under 7h |
| 5 | Weight trend (flat/ahead/on-pace) | 1-5 | EMA-derived rate vs 0.5 target |
| 6 | Logging streak/gap | 0/5 | 3+ unlogged days (alert) or 12+/14 logged (positive) |
| 7 | Dry streak | 2 | 5+ consecutive dry days |
| 8 | Plateau detection | 1 | EMA range < 1.0 lbs over 7+ days |

### Local Analysis Engine — `askLocal(query)`

Keyword-parsed scenario analyzer. Routes queries by regex priority: alcohol (drink count or dry) → sleep → exercise → diet → events → fallback. Calls Engine functions, assembles responses with relatable equivalents and confidence tiers. Responses are instant (no network). Persist to `impact-history` storage key.

**Web app upgrade:** Route through Claude API backend for compound queries. Keep local engine as ≤3s fallback. Include last 14 days of logged data in API context.

### Layer 3: Claude API Integration (Web App)

The local keyword engine covers single-category queries. The Claude API handles everything else — compound scenarios, open-ended questions, personalized pattern analysis, and anything the regex parser can't route.

**Architecture:**
```
User query → Local engine attempts parse
  → If matched: return instant local response
  → If unmatched or compound: POST /api/impact/analyze
      → Backend builds context payload from DB
      → Backend calls Claude API (key protected server-side)
      → Response returned to client
      → Both responses stored in impact-history
```

**Backend endpoint:** `POST /api/impact/analyze`

Request body:
```json
{
  "query": "What if I skip drinking this weekend but only sleep 6 hours?",
  "userId": "zach"
}
```

The backend assembles the full context before calling Claude:

```typescript
// 1. Pull user's recent data from DB
const last14 = await db.getDayRecords(userId, 14);
const weightTrend = Engine.derivedPace(last14);
const tdee = Engine.tdeePipeline(currentWeight, last14);
const patterns = Patterns.detectAll(last14);
const milestones = Engine.checkMilestones(currentWeight);

// 2. Build the context block
const userContext = `
User: Zach, 28M, ${currentWeight} lbs, ${bodyFat}% BF.
BMR: ~${tdee.bmr.toFixed(0)} kcal. TDEE: ~${tdee.tdee.toFixed(0)} kcal (${tdee.avgSteps} avg steps).
Current pace: ${weightTrend.rate.toFixed(2)} lbs/week (${weightTrend.confidence} confidence).
Targets: ${TARGETS.bachelorParty.weight} lbs by Aug 20 (${daysTo(TARGETS.bachelorParty.date)} days), ${TARGETS.wedding.weight} lbs by Sep 5.

Last 14 days summary:
- Weight: ${weights.join(', ')} lbs
- Diet scores: ${dietScores.join(', ')}
- Alcohol: ${drinkDays} drinking days, ${dryDays} dry days
- Sleep avg: ${sleepAvg.toFixed(1)}h (range ${sleepMin.toFixed(1)}-${sleepMax.toFixed(1)})
- Strength sessions: ${strengthCount}
- Active patterns: ${patterns.map(p => p.title).join('; ')}
- Milestones: ${milestones.map(m => m.label).join('; ')}

Key behavioral history:
- Oct-Nov 2025: went dry for 6 weeks, lost 12 lbs at 0.75 lbs/week (best recent period)
- Aug-Sep 2025: 3-month plateau despite daily logging — steps alone didn't create deficit
- Weekend drinking + eating is the primary pattern that erases weekday discipline
- Logging gaps are the #1 failure mode (8-month gap = 12 lb gain)
- Calorie counting doesn't stick — higher-leverage approaches only
`;

// 3. Call Claude API
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 500,
  system: SYSTEM_PROMPT,
  messages: [{ role: "user", content: userContext + "\n\nQuestion: " + query }],
});
```

**System prompt (locked):**
```
You are the decision-impact engine for a fitness tracking app. You translate lifestyle scenarios into body composition trajectory impacts.

HARD RULES:
1. ALWAYS give RANGES, never point estimates. Never say "you'll weigh 203.4 lbs." Say "this pattern typically shifts the trajectory by roughly 0.2-0.4 lbs/week."
2. Mark EVERY physiological claim with a confidence tier:
   🟢 Well-established — meta-analyses, >1000 subjects, consistent replication
   🟡 Evidence-supported — multiple RCTs, consistent direction, limited samples
   🔴 Plausible but uncertain — single studies, animal data, mechanistic inference
3. Frame FORWARD, not backward. Show recovery paths and opportunity, not blame.
4. Be SPECIFIC about mechanisms: fat oxidation suppression %, MPS reduction, sleep architecture disruption, hunger hormone cascades. These are what make the explanation credible.
5. Use RELATABLE equivalents: "could undo roughly 3-4 clean days" rather than calorie math.
6. Reference the user's ACTUAL DATA when relevant — their specific patterns, their Oct-Nov 2025 breakthrough, their weekend behavior.
7. Keep responses under 150 words. Dense and useful, not verbose.
8. You are CONSTRAINED by the deterministic engine. You cannot invent physiological claims beyond the evidence tables. If you don't know, say the confidence is 🔴 and explain why.
9. NEVER recommend calorie counting or detailed food logging — the user has tried it and it doesn't stick. Higher-leverage approaches only.

PHILOSOPHY: "You are a whole, complicated, weird person. We give you context to live your life the way you want to, not to judge."
```

**Response handling:**

```typescript
// Parse Claude response
const text = response.content
  .filter(b => b.type === "text")
  .map(b => b.text)
  .join("");

// Store in impact history
await db.addScenario({
  userId,
  query,
  response: text,
  source: "claude_api",
  model: "claude-sonnet-4-20250514",
  timestamp: Date.now(),
});

return { response: text, source: "claude_api" };
```

**Fallback behavior:**
- If Claude API takes > 3 seconds, show local engine response immediately with a note: "Quick analysis from local engine. Full analysis loading..."
- If Claude API fails entirely, show local response only
- If local engine has no match AND Claude API fails, show: "I couldn't parse that scenario. Try being more specific — e.g. '6 drinks on Friday' or 'what if I go dry for 3 weeks?'"

**Cost estimate:** Claude Sonnet at ~$3/M input tokens, ~$15/M output tokens. Each query is ~500 input tokens (context) + ~200 output tokens. At 5 queries/day = ~$0.50/month. Negligible for single user.

---

## Data Ingestion

### Architecture

```
Data Source → normalize() → Ingest.syncFromSnapshot(days) → Storage
```

`Ingest` module has two methods:
- `syncDay(day)` — writes one normalized day, merges with existing (won't overwrite manual logs)
- `syncFromSnapshot(days)` — bulk write + records `last-sync` timestamp

Each record tagged with `source: "health_connect"` or `source: "fitbit"` or `source: "manual"`.

### POC: Health Connect via Claude

Claude pulls Health Connect data using `health_connect_query_v0` tool, transforms into normalized snapshot array, hardcodes it in `HC_SNAPSHOT`. App syncs on init if last sync > 1 hour.

### Web App: Fitbit Web API

```
GET /api/fitbit/sync → OAuth 2.0 → Fitbit REST API
  → /1/user/-/body/log/weight/date/{date}/{period}.json
  → /1.2/user/-/sleep/date/{date}/{period}.json  
  → /1/user/-/activities/date/{date}.json
  → normalize to same { date, weight, sleep, activity } shape
  → Ingest.syncFromSnapshot(normalized)
```

Rate limit: 150 req/hr. Auto-sync on app open if stale. Manual refresh in Settings.

### Normalized Day Shape

```typescript
interface DaySnapshot {
  date: string;           // "2026-03-08"
  weight?: { lbs: number; bodyFat?: number; };
  sleep?: { hours: number; };
  activity?: {
    steps?: number;
    strengthSession?: boolean;
    duration?: number;
    run?: boolean;
    runDuration?: number;
    walk?: boolean;
  };
}
```

---

## Storage Schema

All data persists as JSON key-value pairs. POC uses `window.storage`. Web app: IndexedDB → Postgres.

| Key Pattern | Shape | Written By |
|---|---|---|
| `weight:{date}` | `{lbs, bodyFat?, date, source}` | Ingest or manual Log |
| `diet:{date}` | `{mode, score or meals, date}` | Log |
| `alcohol:{date}` | `{totalDrinks, sessions[], dry?, date}` | Log |
| `sleep:{date}` | `{hours, date, source}` | Ingest or manual Log |
| `activity:{date}` | `{steps?, strengthSession?, run?, duration?, date, source}` | Ingest or manual Log |
| `config` | `{targets, preferences}` | Settings |
| `model-state` | `{tdee, trendRate}` | Engine |
| `ui:tab` | `string` | Tab navigation |
| `impact-history` | `[{id, query, response, timestamp}]` | Impact view |
| `last-sync` | `{timestamp, source, daysCount}` | Ingest |

---

## Design System

### Colors
```
--bg: #0d1117        --card: #1a2235      --raised: #1f2d45
--amber: #f5a623     --coral: #f26522     --gold: #ffd166
--teal: #06d6a0      --sky: #4fc3f7       --rose: #ef476f
--lav: #9b5de5
--t1: #f0e6d3 (primary text)
--t2: #9aabb8 (secondary)
--t3: #5e6a7a (tertiary)
```

### Typography
- Display: Outfit (weights 500-900)
- Body: DM Sans (weights 400-700)
- Labels: DM Sans 800, 11px, uppercase, 0.12em tracking

### Components
- Card: 16px radius, 1px border rgba(255,255,255,0.06), glass overlay gradient
- Pill: 40px radius, 3px 12px padding, uppercase, border + fill from color
- Btn: 40px radius, 12px 24px padding, glow shadow, disabled at 0.4 opacity
- Arrow (directional): SVG, rotated by good/bad state, color-matched glow drop-shadow
- ConfBadge: 🟢 Well-established / 🟡 Evidence-supported / 🔴 Plausible but uncertain

### Mobile-First
- Max width: 430px centered
- Touch targets ≥ 44px
- Bottom tab bar with safe-area inset
- Swipe gestures on scenario cards

---

## Philosophy & Framing Rules

These are constraints on every piece of text the app generates:

1. **No false precision.** Never show "207.8 lbs in 4 weeks." Use directional arrows, relatable equivalents ("could undo 3-4 clean days"), and ranges.

2. **Forward-looking, not backward-looking.** "Going dry this weekend would preserve your momentum" not "You ruined your week by drinking."

3. **Pattern-level language.** "This is the pattern that stalled Aug-Sep 2025" not "You gained 0.3 lbs from this decision."

4. **Confidence tiers visible.** Every engine output shows 🟢/🟡/🔴. The user should always know how sure we are.

5. **Core philosophy:** "You are a whole, complicated, weird person. Anything in this app is a narrow representation of who you are. We give you context to live your life the way you want to, not to judge."

---

## User Context (Zach-Specific)

| Fact | Detail |
|---|---|
| Age | 28 |
| Height | 72 inches (6'0") |
| Start weight | 208.6 lbs / 17.9% BF (Mar 6, 2026) |
| BP target | 200 lbs by Aug 20, 2026 |
| Wedding target | 196 lbs by Sep 5, 2026 |
| Proven pace | 0.5-0.75 lbs/week (Oct-Nov 2025) |
| Key lever | Alcohol elimination (12 lbs in 6 weeks when dry) |
| #1 risk | Logging gaps (8-month gap = 12 lb gain) |
| #2 risk | Weekend eating/drinking pattern |
| Medical | Ulcerative colitis, medication transition |
| Training gap | 1x/week strength, target 3x |
| Sleep avg | ~7.0h, target 7.5+ |
| Steps avg | ~14,500/day (strong) |
| Motivation | Competitive — "better than friends at bachelor party" |

---

## Web App Tech Stack (Recommended)

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14+ (App Router) | SSR for initial load, API routes for Fitbit OAuth |
| Language | TypeScript | Engine is pure functions, easy to type |
| State | Zustand | Lightweight, works with async storage |
| Storage | IndexedDB (local) → Postgres (cloud sync) | Offline-first, eventually synced |
| Styling | Tailwind + CSS variables | Design tokens already defined |
| Charts | Canvas API (hand-drawn) | POC style, keep the organic feel |
| AI | Claude API via backend route | API key protected server-side |
| Health Data | Fitbit Web API (OAuth 2.0) | Cloud-accessible, 150 req/hr |
| Hosting | Vercel | Pairs with Next.js, edge functions |
| Auth | Clerk or NextAuth | Simple, handles OAuth flows |

---

## What the POC Validated

- The Vibes diet scale works better than calorie logging — it's faster and stickier
- "Dry day — log it" as a positive action feels right
- The directional framing (arrows, clean-days equivalents) is more useful than projected weights
- Pattern nudges on the dashboard are the most glanced-at feature
- The scrollable trajectory needs real weight data to be meaningful (cosmetic-only was useless)
- Local scenario analysis is instant and covers 90% of questions — Claude API is only needed for compound queries
- Health Connect data flowing in transforms every view from empty to alive

## What the POC Didn't Validate

- Whether daily logging actually sticks over weeks (POC built Mar 8, photo check-in Mar 20)
- Whether the impact framing changes decisions or just informs them
- Optimal trajectory window size (7 days default, should be configurable)
- Whether progress photos add enough value to justify the UX complexity
- Multi-user support / sharing / accountability features

---

## File Manifest

| File | Purpose |
|---|---|
| `app.jsx` | Complete POC source (~1700 lines, single file) |
| `prd_fitness_tracker.md` | Full PRD with all 16 design decisions and research |
| `architecture_doc.md` | Screen-by-screen architecture with data flows |
| `critical_review_next_steps.md` | Honest assessment of gaps and priorities |
| `local_engine_implementation.md` | Detailed analysis of the local Ask Anything engine |
| `health_data_integration_guide.md` | Health Connect / Fitbit / Apple HealthKit comparison |
| This document | Clean handoff spec for web app build |
