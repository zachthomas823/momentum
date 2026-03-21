# Critical Review & Next Steps
*Honest assessment of what's been built, what's broken, and what to do about it*

**Date:** March 8, 2026

---

## What's Been Done Well

**The research foundation is strong.** Three reports covering evidence, competitive landscape, and integration strategy. The evidence report in particular is thorough — dose-dependent alcohol impact chains, sleep-body-composition partition data (Nedeltcheva), Forbes-Hall models, BIA accuracy limits, and the MacroFactor TDEE algorithm as a reference implementation. This will hold up as a foundation for both the POC and web app.

**The philosophy is right.** "You are a whole, complicated, weird person" is a genuine differentiator. Most fitness apps assume discipline is the goal. This one assumes *informed choice* is the goal. The framing constraint — forward-looking opportunity, not backward-looking blame — is embedded in the PRD and the engine summaries. This is the kind of thing that's easy to lose during implementation and hard to retrofit. Getting it defined early was the right move.

**The design language works.** Kurzgesagt's cosmic dark palette with warm amber/teal accents, Outfit display type, the Spore-style winding timeline — these give the app a distinctive visual identity that doesn't look like any existing fitness app. The design is opinionated in a way that most health apps avoid.

**The logging UX has thoughtful details.** Date picker for past days, Vibes/Meals toggle, persisted state showing what's already logged, additive alcohol sessions, "Dry day — log it" as a positive action rather than absence of a negative one. These are the kind of details that determine whether someone actually uses the app daily.

**The decision to build documents first was correct.** The PRD, architecture doc, research reports, and integration guide form a handoff package. When this moves to Claude Code, the developer context is comprehensive rather than "look at the code and figure it out."

---

## What's Broken or Incomplete

### 1. The Engine Is Not Connected to Real Data

This is the biggest problem. The decision-impact engine exists as a set of pure functions, but:

- **`projectedWeight()` uses a hardcoded 0.5 lbs/week rate.** It doesn't use the engine's own TDEE or deficit calculations. The projection is just `currentWeight - 0.5 * weeks`, which is a static line, not a model.
- **`tdeeEstimate()` is built but never called.** Nowhere in the app does it calculate TDEE from BMR + steps. The function exists in the Engine object and is documented in the architecture doc as if it's running, but it isn't.
- **`weeklyDeficit()` is built but never called.** Same problem. The engine has the pieces to dynamically estimate energy balance from diet quality scores, but they're not wired together.
- **The trajectory visualization is cosmetic.** The winding river band is a static sinusoidal wave that's the same regardless of data. It doesn't respond to weight entries, logged events, or the engine's projections. The "widening toward future" is a hardcoded formula based on position, not computed uncertainty. This is the core visual of the entire product and it's currently decoration.

**Why this matters:** The whole value proposition is "see how your choices bend the trajectory." Right now, the trajectory doesn't bend. It's a pretty picture sitting next to real data, but the two aren't connected.

### 2. No Health Connect Data Is Flowing In

The app can write diet and alcohol logs to storage, but:

- Weight, body fat, sleep, steps, heart rate, and exercise sessions are never populated. The dashboard shows "—" for weight and body fat.
- The Health Connect data that Claude reads at the start of coaching conversations doesn't automatically flow into the artifact's persistent storage. These are separate contexts.
- The `buildEventsFromData()` function generates events from stored data, but the data shapes it expects (`d.sleep?.hours`, `d.activity?.strengthSession`) are never written by any flow in the app.
- The weekly scorecard (Strength sessions, Diet logged, Drink days) will always show 0 for strength because there's no way to log or ingest exercise data.

**Why this matters:** The app can't be used as a daily tool until it has real data flowing through it. Without weight data, there's no trend. Without sleep data, the sleep impact model is theoretical. Without exercise data, half the timeline is empty. The POC was supposed to validate what "feels right" through daily use — but daily use requires daily data.

### 3. The Scenario Comparison Math Is Wrong

`compareScenarios()` has several issues:

- **Time scale mismatch.** The preset "Gym night vs Drinks night" describes a single evening, but the engine projects it as if the pattern repeats weekly for 4 weeks. One night of 4 drinks does not cost the same as 4 drinks every week for a month. The "Dry month vs 2x/week" preset works correctly at a weekly scale, but the evening presets don't.
- **Impact modifiers are treated as independent and additive.** But they're not — alcohol disrupts sleep which increases next-day calorie intake which affects weekly balance. The cascading interaction is the whole point of the app's differentiator, yet the engine sums them as parallel independent channels.
- **`sumShift()` mixes units.** Sleep's `kcalIncrease` gets divided by 3500 to convert to lbs/week, but alcohol's `weeklyTrajectoryShift` is already in lbs. Diet's `weeklyTrajectoryShift` is computed from daily kcal deltas. Exercise's is computed from per-session kcal. These represent different time periods (daily, per-event, weekly) but are summed as if they're the same.
- **The midpoint averaging (`[low + high] / 2`) loses the range.** The whole philosophy is "ranges, not point estimates" but `compareScenarios` collapses every range to its midpoint before summing. The final output should be a range, not a number derived from averaged ranges.

### 4. The Claude API Context Is Too Thin

The "Ask Anything" feature sends the user's static profile (weight, BMR, targets) but doesn't include:

- Their actual logged data (diet scores this week, alcohol sessions, sleep patterns)
- The engine's current calculated outputs (TDEE estimate, trend rate, projected trajectory)
- Their historical patterns (the Oct-Nov breakthrough data, the Aug-Sep plateau, the holiday spike pattern)

Without this context, Claude can give generic evidence-based answers but can't say "your last 3 weeks show..." or "based on your actual sleep data..." — which is the entire value of having an AI that knows your data versus just Googling the question.

### 5. Phase 1 Was Skipped

The PRD defines Phase 1 as: Health Connect ingestion, weight smoothing algorithm, trajectory responding to real data. Phase 2 is: decision-impact engine, interactive events, what-if scenarios.

We jumped to Phase 2 without completing Phase 1. The engine is built and the what-if UI works, but the foundation underneath it — real data flowing in, smoothed weight trends, a trajectory that responds to actual inputs — doesn't exist. It's like building the 2nd floor of a house before pouring the foundation.

This happened because the engine and UI are more interesting to build than the plumbing of data ingestion. But the plumbing is what makes the app usable.

### 6. The PRD Has Become Unwieldy

The PRD is now ~770 lines covering research summaries, philosophical statements, evidence tables, 16 design decisions, 5 phase definitions, 11 open questions (marked resolved), and feature specs. For its original purpose — capturing decisions as they were made — this was fine. For its handoff purpose — telling Claude Code what to build — it's too much. The developer needs:

- What to build (screens, interactions, data flows)
- The rules (philosophy, confidence tiers, framing constraints)
- The engine spec (formulas, tables, input/output shapes)

They don't need the journey of how we got there, the competitive analysis summary, the research methodology, or the questions that were asked and answered. The PRD should be forked into a clean handoff spec and a "project history" archive.

### 7. Code Quality Is POC-Grade (By Design, but Worth Noting)

- Single 685-line file with all components, engine, storage, and views
- Inline styles everywhere (necessary for Claude artifacts, but not portable)
- No error boundaries — a bad storage read could crash the whole app
- No loading states on data-dependent components (the dashboard renders immediately with stale/empty data)
- No input validation on diet/alcohol logging
- The canvas trajectory redraws fully on every render cycle that changes `days` or `windowDays`

These are all acceptable for a POC and would all be addressed in the web app build. Flagging them so the handoff doc doesn't inherit the assumption that the code patterns are production-ready.

---

## What Was Over-Invested vs Under-Invested

| Over-Invested | Under-Invested |
|---|---|
| Research reports (3 deep dives before any working product) | Actual data flowing through the system |
| PRD iteration (16 design decisions, 770+ lines) | Weight smoothing / trend algorithms |
| Visual design polish (Kurzgesagt theme, canvas river) | Connecting the engine to real inputs |
| Architecture documentation | Manual data entry for weight/sleep/exercise (workaround for no Health Connect) |
| What-if scenario UI | The trajectory responding to anything real |
| Competitive analysis depth | Testing with actual daily use |

This isn't a criticism of the research-first approach — the research is genuinely valuable and the decisions it informed are sound. But the balance has tilted toward documenting what to build rather than building something usable. The POC's stated purpose is to "validate what feels right through daily use." We're not there yet because the app can't be used daily with real data.

---

## Next Steps (Prioritized by Impact on Usability)

### Immediate: Make It Usable With Real Data

**Step 1: Manual data entry for weight, sleep, and exercise.**

Health Connect auto-ingestion requires being inside the Claude mobile app's native context, which the artifact can't trigger on its own. Until the web app with Fitbit API, the fastest path to real data is manual entry fields. Add to the Log view:

- **Weight entry:** Simple number input. One field, one tap. "Step on the scale, type the number." Write to `weight:{date}` with `{lbs, bodyFat}` (bodyFat optional).
- **Sleep entry:** Hours slept last night. Single number input. Write to `sleep:{date}` with `{hours}`.
- **Exercise entry:** Type toggle (Strength / Run / Walk) + duration in minutes. Write to `activity:{date}`.

This is not the long-term solution — Health Connect and Fitbit API are. But it's what makes the app usable *this week* while we're in POC mode.

**Step 2: Wire the trajectory to real weight data.**

Once weight entries exist in storage, the trajectory canvas should:
- Plot actual weight points along the past section of the river
- Calculate a smoothed trend line (exponential moving average, α=0.1)
- Derive the actual weekly loss rate from the trend
- Feed that rate into `projectedWeight()` instead of the hardcoded 0.5 lbs/week
- Widen the uncertainty band based on actual variance in the trend rate, not a cosmetic formula

This is the single highest-impact change. It turns the trajectory from decoration into a living visualization.

**Step 3: Feed real logged data into the Claude API context.**

When "Ask Anything" calls Claude, include the last 7 days of actual logged data: diet scores, alcohol sessions, sleep hours, exercise sessions, and weight trend. This lets Claude answer personal questions ("what was different about my best days?") instead of generic ones.

### Near-Term: Fix the Engine

**Step 4: Fix `compareScenarios` time scale handling.**

Add a `timeScale` parameter to presets: "single-event" vs "weekly-pattern". For single-event presets (Gym night vs Drinks night), calculate the one-time impact without multiplying by 4 weeks. For weekly-pattern presets (Dry month vs 2x/week), keep the current multiplication. Display different framing: "This Friday night's impact" vs "This pattern over 4 weeks."

**Step 5: Implement cascading effects, not parallel summation.**

Instead of summing independent impact modifiers, chain them:
```
alcohol(4 drinks)
  → sleepImpact(reduced by alcohol's sleep disruption)
  → nextDayDiet(shifted by sleep-driven hunger increase)
  → weeklyBalance(summing actual cascaded chain)
```

This is the core differentiator. The parallel-sum approach is no different from what any calorie counter does. The cascading chain is what no one else has.

**Step 6: Wire Layer 1 functions into the projection.**

Connect the TDEE pipeline: `bmr()` → `tdeeEstimate(bmr, steps)` → `weeklyDeficit(tdee, dietAvg)` → `projectedWeight(current, derivedRate, weeks)`. This makes the projection actually respond to logged data rather than using a constant.

### Document Cleanup

**Step 7: Fork the PRD into a clean handoff spec.**

Create a new document that contains only:
- Screen-by-screen specs (what to build)
- Engine spec (functions, inputs, outputs, formulas, tables)
- Design system (colors, typography, component patterns)
- Data model (storage schema, API formats)
- Philosophy and framing rules
- Phase 4+ roadmap items

Strip out: research journey, competitive analysis summaries, resolved open questions, decision-making rationale. Archive those in the project history for context.

**Step 8: Add a "POC Learnings" section to the handoff doc.**

As the app gets used daily, capture: what logging frequency actually happened, which screens were opened most, whether the impact framing motivated or overwhelmed, what data was looked at vs ignored, where the UI felt too dense or too sparse. This section should be written by you (Zach), not by me — it's the subjective experience that the engine and architecture can't capture.

### Roadmap Adjustments

**Revised phase plan based on this review:**

- **Phase 1.5 (gap fill):** Manual weight/sleep/exercise entry, trajectory wired to real data, weight smoothing algorithm, engine pipeline connected. This is the skipped foundation work.
- **Phase 2.5 (engine fix):** Cascading effects, time scale correction in scenarios, real data in Claude API context.
- **Phase 3:** As planned — proactive pattern detection, timeline detail view, progress photos, weekly summaries.
- **Handoff prep:** Fork PRD into clean spec, accumulate POC learnings, prep for Claude Code build.

---

## Summary

The strategic thinking is solid — the philosophy, the research, the visual direction, the architecture decisions. The engine concept is genuinely novel and the evidence grounding is real. The documents are comprehensive enough to hand off.

The gap is between what's documented and what's functional. The trajectory doesn't respond to data. Health data isn't flowing in. The engine's Layer 1 functions are built but not connected. The scenario comparisons have math errors. The core feedback loop — log data, see it on the trajectory, understand the impact — isn't working end to end.

The next sprint should focus entirely on closing that loop: manual data entry → real data in storage → trajectory responds → engine projections are data-driven. Everything else — polish, new features, document cleanup — comes after the core loop works.
