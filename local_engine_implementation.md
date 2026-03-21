# Local Analysis Engine — Implementation Detail
*Technical reference for the "Ask Anything" scenario analyzer*

---

## Why Local Instead of Claude API

The original implementation called `api.anthropic.com/v1/messages` from the artifact sandbox. This consistently timed out after 30 seconds on mobile — the artifact sandbox doesn't have reliable outbound network access to external APIs. The `fetch()` call would hang indefinitely until our hard timeout killed it.

The local engine replaces this with a keyword-parsed, Engine-function-backed analysis that runs synchronously in ~0ms. The tradeoff: less flexible natural language understanding, but instant responses, no network dependency, and every response is grounded in the same evidence-based modifier tables the rest of the app uses. The Claude API integration moves to the web app where it runs from a proper backend.

---

## Architecture

```
User types "What if I have 6 drinks on Friday?"
                    │
                    ▼
            ┌──────────────┐
            │   askLocal()  │  ← useCallback, lives in useImpactState hook
            └──────┬───────┘
                   │
        ┌──────────▼──────────┐
        │  Keyword Parser     │  ← regex matching on lowercased query
        │                     │
        │  Priority order:    │
        │  1. Alcohol (drink  │
        │     count or dry)   │
        │  2. Sleep           │
        │  3. Exercise        │
        │  4. Diet/food       │
        │  5. Events          │
        │  6. Fallback        │
        └──────────┬──────────┘
                   │
                   │ extracted params (drink count, hours, duration, etc.)
                   │
        ┌──────────▼──────────┐
        │  Engine Functions    │  ← Pure functions from Layer 2
        │                     │
        │  alcoholImpact(n)   │  → fat ox, MPS, sleep, recovery, scale
        │  sleepImpact(hrs)   │  → fat ratio, hunger kcal, MPS
        │  exerciseImpact()   │  → kcal burned, EPOC, MPS boost
        │  dietImpact(score)  │  → kcal delta, trajectory shift
        └──────────┬──────────┘
                   │
                   │ structured impact data
                   │
        ┌──────────▼──────────┐
        │  Response Builder   │  ← Template strings with Engine outputs
        │                     │
        │  - Engine summary   │
        │  - Relatable equiv  │
        │    (clean days)     │
        │  - Cascading chain  │
        │  - Personal context │
        │    (Zach's history) │
        │  - Confidence tier  │
        └──────────┬──────────┘
                   │
                   ▼
        Written to scenarios[] state
        + persisted to window.storage
```

---

## Query Parser — Routing Logic

The parser runs regex matches against the lowercased query in a fixed priority order. First match wins. This means "6 drinks after my gym session" routes to the alcohol handler, not the exercise handler.

### Priority 1: Alcohol

**Two sub-paths:**

**Path A — Specific drink count:**
```javascript
const drinkMatch = q.match(/(\d+)\s*(drink|beer|wine|cocktail|shot)/);
```
Matches: "6 drinks tonight", "4 beers this weekend", "2 cocktails", "10 shots at the party"

Extracts: integer drink count → feeds directly to `Engine.alcoholImpact(n)`

Additional context check:
```javascript
const weekendMatch = q.match(/weekend|saturday|friday|sunday/);
```
If drinks ≥ 4 AND weekend keywords present → appends the Aug-Sep 2025 plateau warning about weekend pattern erosion.

**Path B — Going dry:**
```javascript
const dryMatch = q.match(/dry|sober|no alcohol|quit drinking|stop drinking|skip drinking/);
```
Matches: "go dry for 4 weeks", "what if I stop drinking", "sober October", "skip drinking this month"

Duration extraction:
```javascript
const weeks = q.match(/(\d+)\s*week/) ? parseInt(...) : 4;  // defaults to 4 weeks
```

This path doesn't call an Engine function — it's a hardcoded response that references Zach's actual Oct-Nov 2025 data (12 lbs in 6 weeks when he stopped drinking). This is the strongest personal evidence available, so it deserves its own handling.

### Priority 2: Sleep

```javascript
q.match(/sleep|tired|rest|insomnia|nap/)
```
Matches: "what about 5.5 hours of sleep", "I'm tired", "only got 6h rest", "insomnia last night"

**Two sub-paths:**

**With specific hours:**
```javascript
const hrs = q.match(/(\d+\.?\d*)\s*h/) ? parseFloat(...) : null;
```
Matches: "5.5h sleep", "6 hours", "8.5h rest"

Calls `Engine.sleepImpact(hrs)` → uses the summary, then appends:
- If < 7h: the fat:muscle ratio shift explanation, hunger kcal increase
- Confidence tier from the Engine output

**Without specific hours (general sleep question):**
Returns a complete tier table (8+ / 7 / 5.5 / <5 hrs) with fat ratios, hunger impacts, and MPS effects. References Zach's actual sleep average (~7h with several nights at 6.4-6.8).

### Priority 3: Exercise

```javascript
q.match(/gym|lift|strength|workout|train|exercise|run|cardio|miss/)
```

**Two sub-paths:**

**Missing a session:**
```javascript
const missMatch = q.match(/miss|skip|can't make it/);
```
Returns hardcoded response about detraining risk (minimal for single session), TDEE impact (200-400 kcal), the pattern risk vs single-session risk, and the misleading scale drop from less glycogen.

**Doing a session:**
Duration extraction: `q.match(/(\d+)\s*min/)` → defaults to 45 min
Type detection: `q.match(/run|cardio|jog/)` → "run", else "strength"

Calls `Engine.exerciseImpact(type, duration)` → uses the summary, appends recomp framing.

### Priority 4: Diet / Food

```javascript
q.match(/eat|food|diet|meal|cheat|binge|restaurant|pizza|burger|takeout/)
```

**Two sub-paths:**

**Big meal / cheat:**
```javascript
const bigMeal = q.match(/cheat|binge|blowout|huge|big meal|restaurant|pizza|burger|takeout|buffet/);
```
Returns the "real fat gain vs scale panic" breakdown: 0.15-0.25 lbs actual fat, +1-3 lbs scale (glycogen/water/gut), the "might as well" behavioral spiral warning.

**General diet question:**
Returns the weekday/weekend pattern analysis from Zach's data, the asymmetric math (one bad day erases 2-3 good days), and the "one decision on Friday afternoon" framing.

### Priority 5: Events

```javascript
q.match(/bachelor|party|wedding|event|vacation|trip|holiday/)
```

Returns the single-event framing: real fat gain from a blowout weekend (0.3-0.5 lbs), scale spike (3-5 lbs, resolves in 5-7 days), the coaching plan (cut alcohol 2-3 weeks before, 16-day recovery between bachelor party and wedding).

### Priority 6: Fallback

Any query that doesn't match the above patterns gets a general status overview: current weight, days to bachelor party, the three biggest levers ranked (alcohol, sleep, strength training), and a prompt suggesting specific scenarios to try.

---

## Engine Functions Called

Each handler can call one or more of these pure functions:

### `Engine.alcoholImpact(drinkCount)` → Object

| Input | Tier | Key Outputs |
|---|---|---|
| 1-2 drinks | Light | Fat ox 20-40% suppressed 4-6h, scale +0.3-0.8 lbs, recovery ~12h |
| 3-5 drinks | Moderate | Fat ox 50-70% suppressed 6-8h, scale +1.0-2.5 lbs, recovery 24-36h |
| 6+ drinks | Heavy | Fat ox 73-79% suppressed 8h+, MPS -24-37%, scale +2-5 lbs, recovery 48-72h |

Returns: `{fatOxSuppression, fatOxDuration, mpsImpact, sleepImpact, recoveryHrs, kcalAdded, realFatGain, scaleImpact, scaleNote, weeklyTrajectoryShift, duration, conf, summary}`

### `Engine.sleepImpact(hours)` → Object

| Input | Tier | Key Outputs |
|---|---|---|
| 8+ hrs | Optimal | 50-60% fat loss ratio, baseline hunger, baseline MPS |
| 7 hrs | Adequate | 40-50% fat ratio, +100-200 kcal hunger, modest MPS reduction |
| 5.5 hrs | Poor | 20-35% fat ratio, +300-450 kcal hunger, -18% MPS |
| <5 hrs | Severe | 10-25% fat ratio, +400-600 kcal hunger, significant MPS reduction |

Returns: `{fatRatio, kcalIncrease, mpsImpact, summary, conf, good}`

### `Engine.exerciseImpact(type, durationMin)` → Object

Calculates: `kcalPerMin × duration × [0.8, 1.2]` for burned range, fixed EPOC by type.

Returns: `{kcalBurned, epoc, mpsBoost, weeklyTrajectoryShift, summary, conf, good}`

### `Engine.dietImpact(score)` → Object

Maps Vibes 1-5 to kcal delta range from the DIET constant.

Returns: `{kcalDelta, weeklyTrajectoryShift, summary, conf, good}`

---

## Response Assembly

Every response follows this structure:

```
1. Engine-generated summary sentence
   (from the .summary field of the impact object)

2. Relatable equivalent
   "In practical terms, N drinks would cancel out roughly X-Y clean days of progress."
   Calculation: weeklyTrajectoryShift / 0.07 (estimated lbs/day from a Dialed In day)

3. Cascading mechanism chain (where applicable)
   "The scale will overreact by X-Y lbs — [scaleNote]"
   "Expect +X-Y kcal of hunger-driven eating tomorrow."

4. Personal context (Zach-specific)
   References Oct-Nov 2025 data, Aug-Sep 2025 plateau, weekday/weekend pattern,
   coaching plan milestones, current training frequency

5. Confidence tier
   🟢 Well-established / 🟡 Evidence-supported / 🔴 Plausible but uncertain
   Pulled from Engine's .conf field or hardcoded for template responses
```

Not every response uses all five sections. The fallback response uses none of the Engine functions — it's entirely template-driven from TARGETS constants and coaching context.

---

## Data Flow

```
askLocal("What if I have 6 beers on Friday?")
  │
  ├─ Generate unique ID: "m2abc3xy"
  ├─ Lowercase: "what if i have 6 beers on friday?"
  │
  ├─ Regex match: /(\d+)\s*(drink|beer|wine|cocktail|shot)/
  │   → drinkMatch = ["6 beers", "6", "beer"]
  │   → n = 6
  │
  ├─ Regex match: /weekend|saturday|friday|sunday/
  │   → weekendMatch = ["friday"]
  │
  ├─ Engine.alcoholImpact(6)
  │   → returns heavy tier:
  │     fatOxSuppression: [73, 79]
  │     weeklyTrajectoryShift: [0.3, 0.55]
  │     scaleImpact: [2, 5]
  │     summary: "6 drinks — significant impact..."
  │
  ├─ Calculate clean-days equivalent:
  │   daysLo = round(0.3 / 0.07) = 4
  │   daysHi = round(0.55 / 0.07) = 8
  │
  ├─ Assemble response:
  │   "6 drinks — significant impact. Fat oxidation suppressed ~75%..."
  │   "In practical terms, 6 drinks would cancel out roughly 4-8 clean days..."
  │   "The scale will overreact by 2-5 lbs — Water + glycogen + inflammation..."
  │   "A weekend pattern of this is what stalled progress Aug-Sep 2025..."
  │   "🟡 Evidence-supported"
  │
  ├─ Create scenario object:
  │   { id: "m2abc3xy", query: "What if I have 6 beers on Friday?",
  │     response: "...", loading: false, timestamp: 1741459200000 }
  │
  ├─ setScenarios(prev => [newItem, ...prev])
  └─ S.set("impact-history", updated)  ← persists to storage
```

---

## Persistence

Scenarios persist via:
- **State:** `useState` in the `useImpactState` hook, which lives in the App root (survives tab switches)
- **Storage:** `S.set("impact-history", scenarios)` after every mutation (survives app restarts)
- **Cleanup:** On mount, any scenarios with `loading: true` from a previous interrupted session get their loading flag cleared and response set to "Request interrupted."

Schema for each scenario in storage:
```json
{
  "id": "m2abc3xy",
  "query": "What if I have 6 beers on Friday?",
  "response": "6 drinks — significant impact...",
  "loading": false,
  "timestamp": 1741459200000
}
```

Storage key: `impact-history` → JSON array of scenario objects, newest first.

---

## Interaction Patterns

| Gesture | Action |
|---|---|
| Type + Enter | Submit query (Shift+Enter for newline) |
| Type + tap button | Submit query |
| Swipe card left > 80px | Delete that scenario |
| Swipe card left < 80px | Spring back |
| Long press card (500ms) | Enter select mode with that card pre-selected |
| Tap checkbox in select mode | Toggle selection |
| "Delete N" button | Remove all selected scenarios |
| "Done" button | Exit select mode |
| "Select" button | Enter select mode (none pre-selected) |

---

## Keyword Coverage Matrix

This table shows which queries route to which handlers and which Engine functions they call:

| Query Example | Handler | Engine Function | Extracts |
|---|---|---|---|
| "6 drinks tonight" | Alcohol (count) | `alcoholImpact(6)` | drink count, weekend flag |
| "4 beers on Saturday" | Alcohol (count) | `alcoholImpact(4)` | drink count, weekend=true |
| "go dry for 3 weeks" | Alcohol (dry) | none | week count (default 4) |
| "what if I stop drinking" | Alcohol (dry) | none | — |
| "only got 5.5h sleep" | Sleep (specific) | `sleepImpact(5.5)` | hour count |
| "I'm tired" | Sleep (general) | none | — |
| "miss the gym this week" | Exercise (miss) | none | — |
| "45 min strength session" | Exercise (do) | `exerciseImpact("strength", 45)` | duration, type |
| "went for a 30 min run" | Exercise (do) | `exerciseImpact("run", 30)` | duration, type |
| "had a cheat meal" | Diet (big meal) | none | — |
| "what about my diet" | Diet (general) | none | — |
| "bachelor party weekend" | Events | none | — |
| "going on vacation" | Events | none | — |
| "how am I doing" | Fallback | `Engine.bmr()` | current weight |
| "what should I focus on" | Fallback | `Engine.bmr()` | current weight |

---

## Known Limitations

**Single-category routing.** "6 drinks after a gym session" only analyzes the alcohol — it doesn't also credit the gym session. The first regex match wins. The web app version should decompose multi-factor queries.

**No temporal reasoning.** "What if I drink Friday AND Saturday" is treated the same as a single session. Cumulative multi-day patterns need their own handler.

**Hardcoded personal context.** The Oct-Nov 2025 references, the Aug-Sep 2025 plateau, the weekday/weekend pattern, the 1x/week training frequency — these are all baked into the response templates. When the web app has real data flowing, these should pull from actual recent data.

**No Vibes score extraction from text.** If someone asks "what if I eat like a 2 all week", it hits the general diet handler, not `Engine.dietImpact(2)`. The Vibes scale numbers aren't in the regex.

**Fallback is broad.** Any query the parser can't categorize gets the same generic response. This includes compound questions like "should I focus on sleep or alcohol" that need comparative analysis.

---

## Web App Migration Path

When the web app has a proper backend:

1. **Keep the local engine as the instant fallback.** If the API call fails or takes > 3 seconds, show the local response immediately while the API continues in the background.
2. **Route the API call through a backend endpoint** (not directly from the browser) so the API key is protected and CORS isn't an issue.
3. **Feed real logged data into the API context.** The system prompt should include the last 7-14 days of actual diet scores, alcohol sessions, sleep hours, exercise sessions, and weight trend — not just the static profile.
4. **Let the API handle multi-factor and compound queries** that the keyword parser can't decompose.
5. **Cache API responses** — identical or near-identical queries should return cached results instead of making new API calls.
6. **A/B the two approaches.** For every query, generate both the local response and the API response. Log which one the user finds more useful over time. The local engine may actually win for simple scenarios because it's instant and consistent.
