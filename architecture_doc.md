# Architecture Document: Decision-Impact Fitness Tracker
*Current state: Phase 2 — POC running as Claude artifact*

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                        │
│                                                                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐ │
│  │Dashboard│ │   Log   │ │ Impact  │ │Timeline │ │ Progress │ │
│  │  View   │ │  View   │ │  View   │ │  (stub) │ │  (stub)  │ │
│  └────┬────┘ └────┬────┘ └────┬────┘ └─────────┘ └──────────┘ │
│       │           │           │                                  │
│  ┌────┴───────────┴───────────┴──────────────────────────────┐  │
│  │              SHARED COMPONENTS                             │  │
│  │  Card · Pill · Btn · Label · Arrow · EventCard ·          │  │
│  │  ConfBadge · ImpactDetail · Trajectory · SignalStrip      │  │
│  └────┬───────────┬───────────┬──────────────────────────────┘  │
│       │           │           │                                  │
├───────┴───────────┴───────────┴──────────────────────────────────┤
│                       INTELLIGENCE LAYER                         │
│                                                                  │
│  ┌──────────────────────┐  ┌──────────────────────────────────┐ │
│  │  Engine (Layer 1+2)  │  │  Claude API (Layer 3)            │ │
│  │                      │  │                                  │ │
│  │  bmr()               │  │  System prompt with:             │ │
│  │  tdeeEstimate()      │  │  - User context (weight, BMR,   │ │
│  │  projectedWeight()   │  │    targets, pace)                │ │
│  │  weeklyDeficit()     │  │  - Confidence tier rules         │ │
│  │  alcoholImpact()     │  │  - Range-only output constraint  │ │
│  │  sleepImpact()       │  │  - Philosophy constraint         │ │
│  │  exerciseImpact()    │  │  - 150 word limit                │ │
│  │  dietImpact()        │  │                                  │ │
│  │  compareScenarios()  │  │  POST api.anthropic.com          │ │
│  │                      │  │  /v1/messages                    │ │
│  │  Pure functions.     │  │  Model: claude-sonnet-4          │ │
│  │  No side effects.    │  │                                  │ │
│  └──────────┬───────────┘  └──────────────┬───────────────────┘ │
│             │                              │                     │
├─────────────┴──────────────────────────────┴─────────────────────┤
│                         DATA LAYER                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Storage Abstraction (S)                                  │   │
│  │  get(key) · set(key, val) · list(prefix)                  │   │
│  │                                                           │   │
│  │  Wraps window.storage (Claude artifact persistent KV)     │   │
│  │  Swap target: IndexedDB → REST API → Postgres             │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │                                        │
│  ┌──────────────────────┴───────────────────────────────────┐   │
│  │  Key Schema                                               │   │
│  │                                                           │   │
│  │  weight:{YYYY-MM-DD}    → {lbs, bodyFat, bmr, ...}       │   │
│  │  diet:{YYYY-MM-DD}      → {mode, score|meals, date}      │   │
│  │  alcohol:{YYYY-MM-DD}   → {totalDrinks, sessions[], dry} │   │
│  │  sleep:{YYYY-MM-DD}     → {hours, stages, ...}           │   │
│  │  activity:{YYYY-MM-DD}  → {strengthSession, run, ...}    │   │
│  │  config                  → {targets, preferences}         │   │
│  │  model-state             → {tdee, trendRate, ...}         │   │
│  │  ui:tab                  → active tab string              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  External Data Sources (via Health Connect)               │   │
│  │                                                           │   │
│  │  Fitbit → steps, HR, HRV, sleep stages, exercise         │   │
│  │  Fitdays scale → weight, body fat %, BMR, lean mass      │   │
│  │  (Read by Claude natively, not by the artifact)           │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Screen-by-Screen Breakdown

### 1. Dashboard (Home)

**Component:** `DashboardView`

**What the user sees:**
- Competitive tagline with days-to-bachelor-party countdown
- Two countdown cards (Bachelor Party + Wedding) with day counts
- Trajectory timeline (scrollable, 7-day window, Spore-style winding river)
- Weight and Body Fat stat cards with current values and targets
- Weekly scorecard (Strength sessions / Diet log days / Drink days)
- Pace projection card with engine-calculated weight range at target date

**What runs in the background:**

| System | What It Does | Function/Source |
|---|---|---|
| **Storage (S)** | Loads last 14 days of data on app init | `loadState()` → sequential reads: `weight:`, `diet:`, `alcohol:`, `sleep:`, `activity:` for each date |
| **Engine.bmr()** | Calculates BMR from current weight | Mifflin-St Jeor: `10 × kg + 6.25 × cm − 5 × age − 5` |
| **Engine.projectedWeight()** | Projects weight at bachelor party date | Linear extrapolation at 0.5 lbs/week with ±0.3 lbs/week uncertainty that widens over time |
| **buildEventsFromData()** | Converts stored day records into timeline events | Iterates each day's diet/alcohol/sleep/activity, calls Engine impact functions, returns event objects with labels, good/bad flags, and impact details |
| **Engine.alcoholImpact()** | Attached to each alcohol event on the timeline | Dose-dependent lookup (1-2 / 3-5 / 6+ drinks) returning fat oxidation, MPS, sleep, recovery, kcal, trajectory shift |
| **Engine.dietImpact()** | Attached to each diet event on the timeline | Maps Vibes 1-5 score to kcal delta range and trajectory shift |
| **Engine.sleepImpact()** | Attached to each sleep event on the timeline | Tiered by duration (8+ / 7 / 5.5 / <5 hrs) with fat:muscle ratio, hunger kcal, MPS impact |
| **Engine.exerciseImpact()** | Attached to each exercise event on the timeline | Type-aware (strength vs run) with kcal burned range, EPOC, MPS boost duration |
| **Canvas rendering** | Draws the winding river trajectory band | `useEffect` on mount: plots sinusoidal path, gradient band (amber→teal), day separators, future-zone fade |
| **Date math** | Countdown calculations | `daysTo()` — millisecond diff from today to target date |

**Data flow:**
```
App mount
  → loadState() reads 14 days from Storage
  → setState({days: [...]})
  → DashboardView receives days as prop
  → buildEventsFromData(days) creates event objects
    → For each day: calls Engine.dietImpact / alcoholImpact / sleepImpact / exerciseImpact
    → Attaches impact objects to events
  → Trajectory component renders events as interactive cards over canvas river
  → Engine.projectedWeight() calculates pace projection
  → Dashboard renders stats from most recent weight record
```

---

### 2. Log

**Component:** `LogView`

**What the user sees:**
- 7-day date selector (Today highlighted, past 6 days accessible)
- Past-day banner when logging for a non-today date
- Diet card with Vibes/Meals toggle
  - Vibes mode: 5 emoji buttons (Dumpster Fire → Sniper Mode)
  - Meals mode: 4 text inputs (breakfast/lunch/dinner/snacks)
  - "Logged" pill when data exists, button changes to "Diet Logged — Update Log"
- Alcohol card with drink counter (+/−), type selector, session history
  - "Dry day — log it" button
  - Running session summary for the day
  - Additive logging (log 2 beers now, 2 cocktails later)

**What runs in the background:**

| System | What It Does | Function/Source |
|---|---|---|
| **Storage (S.get)** | Loads existing logs when date changes | `useEffect([selDate])` triggers reads for `diet:{selDate}` and `alcohol:{selDate}` |
| **Storage (S.set)** | Writes on save | `saveDiet()`: writes `diet:{selDate}` with `{mode, score or meals, date}` |
| | | `saveAlc()`: reads existing, appends session, writes `alcohol:{selDate}` with `{totalDrinks, sessions[], date}` |
| | | `saveDry()`: writes `alcohol:{selDate}` with `{totalDrinks:0, dry:true}` |
| **State reset** | Clears inputs when switching dates | `useEffect` dependency on `selDate` resets score, meals, drinks, logged flags, then loads new date's data |

**Data flow:**
```
User taps date button
  → setSelDate(newDate)
  → useEffect fires:
    → Reset all input state to defaults
    → S.get(`diet:${newDate}`) → if exists, populate mode + score/meals, set dietLogged=true
    → S.get(`alcohol:${newDate}`) → if exists, populate alcData, set alcLogged=true
  → User modifies inputs
  → User taps save button
    → saveDiet() or saveAlc() or saveDry()
    → S.set() writes to storage
    → UI updates: Logged pill appears, button changes color/label
```

**Key design decisions:**
- Date-keyed storage (`diet:2026-03-07`) allows logging for any date
- Alcohol uses additive sessions: each save appends to the sessions array, increments totalDrinks
- Diet saves are replace (not append) — last save for a date wins
- Logged state persists across app sessions — reopen the app and see what you already logged

---

### 3. Impact (Decision-Impact Engine)

**Component:** `ImpactView`

**What the user sees:**
- 4 preset scenario comparison cards (tap to run)
- Scenario result panel: side-by-side Scenario A vs B with projected weights at 4 weeks
- Difference summary with per-week and total impact
- "Ask Anything" free-text input with Claude API analysis

**What runs in the background:**

| System | What It Does | Function/Source |
|---|---|---|
| **Engine.compareScenarios()** | Runs preset comparisons | Takes two scenario objects (each with optional alcohol, sleep, diet, exercise params), calls individual impact functions, sums weekly trajectory shifts, projects 4-week weight difference |
| **Engine.alcoholImpact()** | Within scenario comparison | Dose-dependent modifier lookup |
| **Engine.sleepImpact()** | Within scenario comparison | Duration-tiered modifier lookup |
| **Engine.dietImpact()** | Within scenario comparison | Vibes score to kcal range |
| **Engine.exerciseImpact()** | Within scenario comparison | Type + duration to kcal + EPOC |
| **Claude API (Layer 3)** | Free-text scenario analysis | `POST api.anthropic.com/v1/messages` with system prompt containing user context (current weight, BMR, targets, key behavioral levers) and constraints (ranges only, confidence tiers, positive framing, 150 word limit) |

**Preset scenario definitions:**
```
Gym night vs Drinks night:
  A: {exercise: {strength, 50min}, sleep: 8h, diet: 4, alcohol: 0}
  B: {alcohol: 4, sleep: 5.5h, diet: 2}

8h sleep vs 6h sleep:
  A: {sleep: 8, diet: 3}
  B: {sleep: 6, diet: 3}

Clean week vs Normal week:
  A: {diet: 4, alcohol: 0, sleep: 7.5}
  B: {diet: 3, alcohol: 3, sleep: 6.5}

Dry month vs 2x/week:
  A: {alcohol: 0, diet: 4, sleep: 7.5}
  B: {alcohol: 4, diet: 3, sleep: 6.5}
```

**Claude API call architecture:**
```
System prompt:
  "You are a decision-impact engine for a fitness app.
   RULES:
   1. Always give RANGES, never point estimates
   2. Mark every claim: 🟢 Well-established / 🟡 Evidence-supported / 🔴 Plausible but uncertain
   3. Frame positively — recovery paths, not blame
   4. Be specific about mechanisms (fat oxidation, MPS, sleep architecture)
   5. Keep responses under 150 words
   6. Reference the user's actual data when relevant

   User context: Zach, 28M, {currentWeight} lbs, targeting {target} lbs by {date}.
   BMR ~{bmr} kcal. Pace: 0.5 lbs/week.
   Key lever: alcohol elimination (proven Oct-Nov 2025)."

User message: {freeTextInput}

Model: claude-sonnet-4-20250514
Max tokens: 1000
```

**Data flow (preset):**
```
User taps preset card
  → runScenario(preset)
  → Engine.compareScenarios(preset.a, preset.b, currentWeight, 4)
    → sumShift(scenarioA): calls alcoholImpact + sleepImpact + dietImpact + exerciseImpact
    → sumShift(scenarioB): same
    → Calculates diffPerWeek, diffTotal, weightA, weightB
  → setSelected({preset, result})
  → UI renders side-by-side comparison
```

**Data flow (custom/AI):**
```
User types question, taps "Analyze Scenario"
  → askAI()
  → Build system prompt with Engine.bmr() output + user context
  → fetch() POST to Claude API
  → Parse response text from data.content[].text
  → setAiResponse(text)
  → UI renders response in styled card
```

---

### 4. Trajectory Timeline (Shared Component)

**Component:** `Trajectory`

**Used by:** Dashboard (embedded)

**What the user sees:**
- Horizontally scrollable timeline (default: 7 days + 3 future projection days)
- Canvas-rendered winding river band (Spore-style) with gradient from amber (past) to teal (future)
- Band widens toward future = increasing uncertainty
- Day columns with date labels at bottom ("TODAY" highlighted)
- Interactive event cards stacked per day with directional arrows
- Tap any event → expands inline to show full impact detail with confidence tier

**What runs in the background:**

| System | What It Does |
|---|---|
| **buildEventsFromData(days)** | Transforms raw day records into event arrays by calling Engine impact functions for each data point |
| **Canvas useEffect** | Renders on mount/update: calculates sinusoidal path points, draws gradient band with variable width, day separator lines, future-zone fade overlay, dot grid background |
| **Scroll auto-position** | `useEffect` on mount: scrolls to show TODAY near center of viewport |
| **Event expansion state** | Parent manages `expandedEvent` string, passed down to EventCards for toggle behavior |

**Canvas rendering pipeline:**
```
1. Calculate device pixel ratio, scale canvas
2. Draw subtle dot grid (0.7px dots at 28px intervals)
3. Generate path points: sinusoidal wave on descending baseline
4. Calculate band width per x-position (narrow past → wide future)
5. Draw filled band with horizontal gradient (amber → teal)
6. Draw center river line (amber, 2px)
7. Draw day separator lines (dashed for TODAY)
8. Draw future-zone fade overlay
```

**Event card interaction:**
```
User taps EventCard
  → onTap fires with event object
  → Parent toggles expandedEvent state
  → EventCard re-renders:
    → Border changes to solid colored
    → Chevron rotates (▸ → ▾)
    → ImpactDetail panel animates open (slideDown)
      → Shows: summary, trajectory shift, kcal impact, scale impact, recovery duration
      → ConfBadge renders tier icon + label
```

---

### 5. Timeline (Stub — Phase 3)

**Component:** `StubView`

Currently renders a placeholder card with description and phase label. Will become the full-page version of the trajectory timeline with deeper history, "what changed?" annotations, and pattern detection overlays.

---

### 6. Progress (Stub — Phase 3)

**Component:** `StubView`

Placeholder for photo check-in management. Will include photo capture, ghost overlay alignment, side-by-side comparisons, and photos paired with weight/BF% from the same date.

---

### 7. Settings

**Component:** `SettingsView`

**What the user sees:**
- Target display (Bachelor Party + Wedding weight/date)
- Philosophy statement
- Export All Data button
- Phase indicator

**What runs in the background:**

| System | What It Does |
|---|---|
| **Storage (S.list + S.get)** | Export: lists all keys, reads each, serializes to JSON |
| **Clipboard API** | `navigator.clipboard.writeText()` — copies full data dump |

---

## Engine: Evidence-Based Modifier Tables

### Alcohol Impact (Layer 2)

| Drink Count | Fat Oxidation Suppression | MPS Impact | Sleep Impact | Recovery | Scale Impact | Weekly Trajectory Shift | Confidence |
|---|---|---|---|---|---|---|---|
| 1-2 | 20-40% for 4-6 hrs | Likely minimal | Mild REM reduction | 8-16 hrs | +0.3-0.8 lbs (water) | +0.03-0.08 lbs | 🟡 Moderate |
| 3-5 | 50-70% for 6-8 hrs | 10-20% reduction | Significant REM disruption | 24-40 hrs | +1.0-2.5 lbs (water+glycogen) | +0.1-0.25 lbs | 🟡 Moderate |
| 6+ | 73-79% for 8+ hrs | 24-37% reduction | Major disruption | 48-72 hrs | +2-5 lbs (water+glycogen+inflammation) | +0.3-0.55 lbs | 🟢 High |

### Sleep Impact (Layer 2)

| Duration | Fat:Muscle Loss Ratio | Next-Day kcal Increase | MPS Impact | Confidence |
|---|---|---|---|---|
| 8+ hrs | 50-60% fat | Baseline | Baseline | 🟢 High |
| 7 hrs | 40-50% fat | +100-200 kcal | Modest reduction | 🟡 Moderate |
| 5.5 hrs | 20-35% fat | +300-450 kcal | -18% MPS | 🟢 High |
| <5 hrs | 10-25% fat | +400-600 kcal | Significant reduction | 🟡 Moderate |

### Exercise Impact (Layer 2)

| Type | kcal/min | EPOC | MPS Boost | Confidence |
|---|---|---|---|---|
| Strength | ~6.5 (×0.8-1.2 range) | 30-60 kcal | Elevated 24-36 hrs | 🟢 High |
| Running | ~10 (×0.8-1.2 range) | 15-30 kcal | Minimal | 🟢 High |
| Walking | ~4 (×0.8-1.2 range) | 15-30 kcal | Minimal | 🟢 High |

### Diet Impact (Layer 2)

| Vibes Score | Name | kcal Delta from Maintenance | Weekly Trajectory Shift | Confidence |
|---|---|---|---|---|
| 1 — Dumpster Fire | 🔥 | +800 to +1200 | +0.23 to +0.34 lbs | 🟢 High |
| 2 — Meh | 😬 | +200 to +500 | +0.06 to +0.14 lbs | 🟢 High |
| 3 — Cruise Control | 😐 | -200 to +200 | -0.06 to +0.06 lbs | 🟢 High |
| 4 — Dialed In | 💪 | -500 to -300 | -0.14 to -0.09 lbs | 🟢 High |
| 5 — Sniper Mode | 🎯 | -700 to -500 | -0.20 to -0.14 lbs | 🟢 High |

---

## Confidence Tier System

Every engine output and every Claude API response includes a confidence indicator:

| Tier | Icon | Meaning | Criteria |
|---|---|---|---|
| High | 🟢 | Well-established | Meta-analyses, >1,000 subjects, consistent replication |
| Moderate | 🟡 | Evidence-supported | Multiple RCTs, consistent direction, limited sample sizes |
| Low | 🔴 | Plausible but uncertain | Single studies, animal data, mechanistic inference |

**Rendered by:** `ConfBadge` component. Always inline, never hidden behind a tooltip. First-class UI element per D6.

---

## Data Model: Storage Schema

All data persists across sessions via `window.storage` (Claude artifact persistent key-value store). Each key stores a JSON-serialized value.

### Per-Day Records

**`weight:{YYYY-MM-DD}`**
```json
{
  "lbs": 208.6,
  "bodyFat": 17.9,
  "bmr": 2216,
  "leanMass": 160.5,
  "visceralFat": 9.8,
  "source": "health_connect"
}
```

**`diet:{YYYY-MM-DD}`**
```json
// Vibes mode:
{ "mode": "vibes", "score": 4, "date": "2026-03-07" }

// Meals mode:
{
  "mode": "meals",
  "meals": {
    "breakfast": "3 eggs, toast",
    "lunch": "chicken and rice",
    "dinner": "chipotle burrito",
    "snacks": ""
  },
  "date": "2026-03-07"
}
```

**`alcohol:{YYYY-MM-DD}`**
```json
// Drinking day:
{
  "totalDrinks": 4,
  "sessions": [
    { "count": 2, "type": "Beer", "time": "2026-03-07T20:30:00Z" },
    { "count": 2, "type": "Cocktail", "time": "2026-03-07T22:15:00Z" }
  ],
  "date": "2026-03-07"
}

// Dry day:
{ "totalDrinks": 0, "sessions": [], "date": "2026-03-07", "dry": true }
```

**`sleep:{YYYY-MM-DD}`**
```json
{
  "hours": 7.2,
  "stages": { "light": 3.1, "deep": 1.8, "rem": 1.5, "awake": 0.8 },
  "efficiency": 0.89
}
```

**`activity:{YYYY-MM-DD}`**
```json
{
  "steps": 12400,
  "strengthSession": true,
  "duration": 48,
  "run": true,
  "runDuration": 30,
  "activeCalories": 450
}
```

### Singleton Records

**`config`** — User profile, targets, preferences (future: tone setting, window size)

**`model-state`** — Accumulated model parameters: TDEE estimate, trend rate, personalization coefficients (Phase 4: Bayesian parameters)

**`ui:tab`** — Last active tab for session restore

---

## Technology Stack

| Layer | Current (POC) | Web App Target |
|---|---|---|
| **Runtime** | Claude artifact (React JSX) | Next.js or Vite + React |
| **Language** | JavaScript (JSX) | TypeScript |
| **State** | React useState/useEffect | React + Zustand or similar |
| **Storage** | window.storage (Claude KV) | IndexedDB (local) → Postgres (cloud) |
| **Styling** | Inline styles + CSS vars | Tailwind + CSS vars |
| **Fonts** | Outfit (display) + DM Sans (body) via Google Fonts | Same |
| **Charts** | HTML5 Canvas (hand-drawn) | Canvas + D3 or Recharts |
| **AI** | Claude API from artifact (claude-sonnet-4) | Same, from backend |
| **Health Data** | Health Connect (read by Claude natively) | Fitbit Web API (OAuth 2.0) + Health Connect via companion app |
| **Hosting** | N/A (runs in Claude app) | Vercel / Cloudflare |

---

## Portability Notes

The architecture is designed for web app migration (decision D9):

- **Engine is a pure function module.** Zero dependencies on React, storage, or Claude artifact APIs. Copy `Engine` object to a `.ts` file and it works anywhere. All inputs are primitives, all outputs are plain objects.

- **Storage has a 3-method interface.** `get(key)`, `set(key, value)`, `list(prefix)`. Swapping the implementation from `window.storage` to IndexedDB or a REST API requires changing one object definition.

- **Claude API calls use standard `fetch()`.** The system prompt and message format are identical whether called from an artifact or from a Node.js backend. The only change for the web app is routing through a backend to protect the API key.

- **UI components use inline styles with CSS variables.** These map directly to Tailwind classes or a CSS module system. The design tokens (colors, radii, font families) are defined once in `:root` and referenced everywhere.

- **Data model is JSON-serializable.** Every record written to storage is a plain object. No classes, no prototypes, no framework-specific types. Direct portability to any database.
