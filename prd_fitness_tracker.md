# Product Requirements Document: Decision-Impact Fitness Tracker
*Working Name: TBD — "The app that shows you what your choices actually cost"*

**Author:** Zach + Claude AI Coach
**Created:** March 7, 2026
**Status:** Pre-POC — Requirements Definition

---

## 1. Product Vision

### The Problem

Fitness apps overwhelm users with data — steps, calories, sleep scores, weight graphs — but fail to answer the question that actually drives behavior: **"What does this decision mean for where I'll be in a month?"**

Every existing app is either backward-looking (here's what happened) or prescriptive (here's what you should do). None connect a single Friday night decision — gym vs. bar, 8 hours of sleep vs. 6, grilled chicken vs. pizza — to its cascading, compounding consequences on body composition trajectory. The result is that users track obsessively but lack the intuitive understanding of *why* their choices matter at the scale they actually matter.

Meanwhile, the body recomposition demographic (people trying to lose fat while maintaining or gaining muscle) is structurally underserved. The better a recomp goes, the less the scale moves — and nearly every app interprets a stable scale during a deficit as failure.

### The Solution

A fitness tracking app built around a **decision-impact engine** that models the cascading physiological effects of individual lifestyle choices on body composition trajectory. It combines Health Connect biometric data, low-friction diet quality logging, alcohol tracking, and physique photos into a unified view — then uses evidence-based models to show users, with honest uncertainty, how each decision shifts their projected future.

### Core Philosophy

> **You are a whole, complicated, weird person. Anything in this app is a narrow representation of who you are. We will do our best to give you insights on how key decision points affect your trajectory, and how to balance letting loose with recovery. We want to give you the context to live your life the way you want to, not to judge.**

This isn't a tagline — it's the design constraint that governs every product decision. Concretely, it means:

- **The app never assumes the "right" choice is obvious.** Going out with friends on a Friday has real value that doesn't show up in a calorie balance. The app's job is to show the physiological cost honestly so the user can decide if it's worth it — not to tell them it isn't.
- **"Letting loose" is a legitimate input, not a failure state.** The app models recovery from deviation, not just deviation itself. "You drank Saturday — here's what a clean week recovers" is the framing, not "you drank Saturday — here's what you ruined."
- **Narrow data ≠ the whole picture.** The app should regularly acknowledge its own limitations. Weight, body fat, sleep hours — these are slivers of a life. The app should never imply that optimizing these numbers is the point of being alive.
- **Context over judgment.** Every insight the app surfaces should help the user make an informed choice about their own life, not pressure them toward a "correct" behavior. The user defines what matters. The app provides the map.
- **Balance is the goal, not perfection.** The app should celebrate sustainable patterns (4 good days out of 7) more than perfect streaks. It should model the realistic scenario — not the theoretical optimal one.

This philosophy should be felt in the tone of every piece of text, the framing of every insight, the design of every visualization, and the way the app handles "bad" days. It is the single most important differentiator from every other fitness app on the market, which universally assume that more discipline = better and that the app's job is to enforce it.

Zach. One user. A 28-year-old Solutions Architect with a Fitbit, a Fitdays BIA scale, and a wedding on September 5, 2026. He has an athletic background, responds to competitive framing, and has proven he can lose 0.5–0.75 lbs/week when locked in. His #1 failure mode is logging gaps. His #1 behavioral lever is alcohol elimination. His #1 technical need is seeing the cost of his weekend decisions in terms he cares about.

The broader market opportunity — serious recreational athletes pursuing body recomposition — has zero existing apps that do what this does. But V1 is a personal tool.

---

## 2. Goals & Success Metrics

### Primary Goal
Build a POC that lives in the Claude mobile app (React artifact with persistent storage) that Zach uses at least 4x/week through his wedding prep.

### Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Weekly usage | ≥4 sessions/week | Storage timestamps |
| Diet logging adherence | ≥5 days/week logged (any fidelity level) | Log count |
| Alcohol logging adherence | 100% of drinking occasions logged | Self-report |
| Weight logging gaps | 0 gaps >3 days | Health Connect data |
| Subjective value | "This changed at least one decision per week" | Zach's assessment |
| Wedding target proximity | ≤200 lbs by Aug 20, ≤198 lbs by Sep 5 | Scale data |

### Non-Goals (V1)
- Multi-user support
- App Store deployment
- Calorie counting or macro tracking
- Workout programming or exercise prescription
- Social features
- Monetization

### POC Philosophy

**The Claude artifact POC is a test bed, not the product.** Its purpose is to validate what *feels right* and discover what doesn't work — through actual daily use, not speculation. The POC is disposable; the insights it generates are the real output.

Every interaction with the POC should produce learnings:
- Which visualizations actually change decisions vs. which are just interesting to look at
- What level of diet logging fidelity is sustainable over weeks, not just day one
- Whether the decision-impact framing motivates or overwhelms
- What data is actually looked at daily vs. what gets ignored
- Where the model's uncertainty communication feels honest vs. where it feels like hedging
- What the right density of information is on each screen
- Whether the competitive framing stays motivating or becomes grating over time

These insights should be captured continuously — either as notes within the app's settings/feedback mechanism or during coaching conversations — and compiled into a **handoff document** that gives Claude Code (via GSD) everything it needs to build the web app POC. The handoff doc should contain: what worked, what didn't, what to change, refined feature specs based on real usage, and any new requirements that emerged.

**The artifact is the prototype. The handoff doc is the deliverable. The web app is the product.**

---

## 3. User Scenarios

### Scenario 1: Friday Night Decision Point
Zach is deciding between going to the gym and then home, or meeting friends for drinks. He opens the app and taps "What if?" He logs two scenarios: (A) gym + sleep by 11pm, (B) 4 drinks + bed at 1am. The app shows projected impact on this weekend's weight trend, next week's training capacity, and the difference in his 30-day body composition trajectory. Both scenarios show ranges, not point estimates. The gym scenario shows the gain as modest but compounding. The drinking scenario shows a real but recoverable cost — not catastrophizing, but honest.

### Scenario 2: Monday Morning Check-In
Zach steps on the scale Monday morning after a weekend where he drank Saturday and ate out twice. Weight is up 2.4 lbs. The app shows: "Weekend weight is mostly water and glycogen — your 7-day trend moved +0.3 lbs (real) vs. the +2.4 lbs you see on the scale. You're still tracking within your target pace. Here's what recovery looks like if you're solid this week." No shame. No alarm. Context.

### Scenario 3: Progress Photo Comparison
Zach uploads his bi-weekly check-in photos (front and side, morning fasted). The app shows them side-by-side with his previous set from 2 weeks ago, alongside weight/BF% trend and training volume for that period. Visual change paired with data change — the composite picture that tells you if recomp is working even when the scale is flat.

### Scenario 4: Plateau Recognition
Zach has been at ~206 lbs for 3 weeks. The app recognizes the plateau pattern (similar to his Aug–Sep 2025 stall) and surfaces: "Your weight has been flat for 3 weeks despite consistent training. In Oct 2025, your breakthrough came when you stopped drinking for 6 weeks. Your current alcohol frequency is 2x/week. Here's what the model projects if you go dry for the next 4 weeks." Grounded in *his own data*, not generic advice.

### Scenario 5: Quick Diet Log
Zach had a busy day. At 9pm he opens the app and sees the diet prompt. He types "pretty good day, chicken and rice for lunch, grabbed chipotle for dinner, no snacking." The app categorizes this as a "good" day, estimates it was likely near maintenance or slight deficit based on the description, and logs it. No calorie counting. No macro tracking. Just enough signal to inform the weekly energy balance estimate.

---

## 4. Feature Requirements

**Mobile-first, always.** Every screen, interaction, and visualization is designed for a phone screen held in one hand. This means: touch targets ≥44px, single-column layouts, horizontal swipe for timeline navigation, bottom-anchored navigation tabs reachable by thumb, no hover states, no tiny text, no dense tables. The POC runs in the Claude mobile app; the web app will be responsive but mobile is the primary viewport. If a design works on desktop but not on a phone, it's wrong.

### 4.1 Dashboard (Home Screen)

**Priority: P0 — Must have for POC**

The landing screen shows the current state of the mission at a glance.

**Content:**
- Days remaining to bachelor party / wedding (countdown timers)
- Current weight (most recent) + 7-day trend line + trend direction indicator
- Current body fat % + trend direction
- Projected weight at bachelor party / wedding at current pace (range, not point estimate)
- Pace indicator: on track / ahead / behind target of 0.5 lbs/week
- This week's scorecard: strength sessions (actual vs. 3x target), sleep average, alcohol count, diet quality average
- Last photo check-in date + days until next one

**Design principles:**
- The countdown is the emotional anchor — everything relates back to the timeline
- Green/yellow/red status indicators for pace, not for individual metrics
- No information that requires scrolling to understand the headline

### 4.2 Weight & Body Composition Tracking

**Priority: P0**

**Data sources:** Health Connect (Fitdays scale → weight, body fat %, BMR, lean mass, visceral fat)

**Features:**
- Daily weight plot with exponential moving average trend line (configurable smoothing — default ~7 day window, user can adjust)
- Body fat % plot with same smoothing
- Lean mass derived plot (weight × (1 - BF%))
- Projected trajectory to target dates with **fan chart** showing widening confidence intervals over time
- Rate of change display: lbs/week over trailing 7, 14, 30 days
- Milestone markers (Happy Scale style): break the 208→194 journey into ~4 lb chunks with celebration when each is crossed
- Distinguish between "real" weight change (trend) and noise (daily fluctuation) — surface the magnitude of noise explicitly so the user learns to ignore it
- Flag missing weigh-in data prominently after 2 days

**Smoothing algorithm:** Implement the Hacker's Diet exponential smoothing as baseline (`trend = previousTrend + α × (weight - previousTrend)` where α is configurable, default 0.1). Consider upgrading to MacroFactor-style weighted moving average with linear interpolation for missing days if the simpler approach doesn't handle gaps well.

**Projection model:** Linear extrapolation of the current trend rate, bounded by Forbes equation constraints (leaner individuals lose proportionally more lean mass — the projection should reflect this). Display as a fan chart: center line is the trend extrapolation, inner band is ±1 lb (measurement noise), outer band widens over time based on the variance of past trend rate changes. Never show a single projected number without a range.

### 4.3 Decision-Impact Engine

**Priority: P0 — This is the differentiator**

The core feature. Models how individual decisions cascade through interconnected physiological systems and shift body composition trajectory.

**Architecture: Three-Layer Hybrid**

**Layer 1 — Deterministic Energy Balance Core:**
- Mifflin-St Jeor equation for initial BMR estimate: `BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age - 5`
- Activity multiplier from step count + logged exercise to estimate TDEE
- Back-calculate actual TDEE from weight trend + diet quality signals (convergence over 3-4 weeks)
- Forbes equation for body composition partitioning during weight loss: `FFM = 10.4 × ln(FM) + 14.2`
- All calculations output probability distributions, not point estimates

**Layer 2 — Decision Impact Modifiers (evidence-based, with confidence ratings):**

Each modifier has a researched magnitude range, a duration of effect, and an evidence confidence level.

*Alcohol:*
| Drinks | Fat Oxidation Suppression | MPS Impact | Sleep Quality Impact | Recovery Duration | Evidence |
|---|---|---|---|---|---|
| 1-2 | ~30% for 4-6 hrs | Likely minimal (no human data) | Mild REM reduction | ~12 hrs | Moderate |
| 3-5 | ~50-70% for 6-8 hrs | Estimated 10-20% reduction | Significant REM disruption | ~24-36 hrs | Moderate |
| 6+ | ~73-79% for 8+ hrs | 24-37% reduction (Parr et al.) | Major architecture disruption | ~48-72 hrs | Strong |
| Weekend binge pattern | Cumulative: wipes weekday deficit | Compounds across sessions | Multi-night degradation | 4-5 days per WHOOP data | Moderate |

*Sleep:*
| Duration | Fat:Muscle Loss Ratio | Next-Day Calorie Increase | MPS Impact | Evidence |
|---|---|---|---|---|
| 8+ hrs | ~56% fat (optimal) | Baseline | Baseline | Strong |
| 7 hrs | ~45% fat (estimated) | +100-200 kcal | Modest reduction | Moderate |
| 5.5 hrs | ~25% fat (Nedeltcheva) | +385 kcal (meta-analysis avg) | -18% (single night deprivation) | Strong |
| <5 hrs | <25% fat | +500+ kcal | Significant reduction | Moderate |

*Exercise (missed session):*
| Scenario | Weekly MPS Impact | Caloric Impact | Detraining Risk | Evidence |
|---|---|---|---|---|
| Miss 1 of 3 sessions | ~33% weekly MPS reduction (if volume not redistributed) | -200-400 kcal TDEE | None (within 3 weeks safe) | High |
| Miss 1 week entirely | Significant but reversible | -600-1200 kcal TDEE | Minimal — glycogen/water loss, not muscle | High |
| Miss 2+ weeks | Measurable strength decline begins | Sustained deficit reduction | Real but recoverable via muscle memory | High |

*Single dietary deviation:*
| Scenario | Actual Fat Gain | Scale Impact (next day) | Weekly Balance Impact | Evidence |
|---|---|---|---|---|
| +500 kcal meal (e.g., office cake) | ~0.05-0.1 lbs fat | +0.5-1.5 lbs (glycogen/water) | Negligible if isolated | High |
| +1000 kcal day (restaurant + drinks) | ~0.15-0.25 lbs fat | +1-3 lbs (glycogen/water) | Noticeable but recoverable in 3-4 days | High |
| Weekend blowout (+2000 kcal over 2 days) | ~0.3-0.5 lbs fat | +2-5 lbs (glycogen/water) | Can erase weekday deficit entirely | High |

**Layer 3 — LLM Contextual Interpreter (Claude API):**
- Takes the numerical outputs from Layers 1 and 2
- Generates natural language explanations grounded in the math
- Handles "what-if" queries: user describes a scenario, LLM maps it to model parameters
- Constrained by the deterministic core — the LLM interprets and explains but **cannot override the physics**
- All LLM outputs must include the evidence confidence tier

**Confidence Tier System (displayed to user):**
- 🟢 **Well-established** — Meta-analyses, >1,000 subjects, consistent replication
- 🟡 **Evidence-supported** — Multiple RCTs, consistent direction, but limited sample sizes
- 🔴 **Plausible but uncertain** — Single studies, animal data, or mechanistic inference only

**Critical UX Constraint — implements the Core Philosophy (Section 1):**

The decision-impact engine is the place where the philosophy is most tested. Every output must pass the filter: *does this give the user context to live their life the way they want, or does it judge them for how they're living it?*

Framing that works: "Going to the gym tonight shifts your projected body fat by ~0.1-0.3% over the next month" — context, not pressure.

Framing that works: "You had 4 drinks Saturday. A clean week from here gets you back on pace by Thursday. Here's what recovery looks like." — acknowledges reality, models the path forward, treats the deviation as a data point, not a moral failing.

Framing that fails: "You skipped the gym and drank — here's how much that set you back" — backward-looking blame.

Framing that fails: "You should go to the gym instead of going out" — prescriptive, ignores that the user's life has value beyond body composition.

The app provides the map. The user chooses the route.

### 4.4 Alcohol Tracking

**Priority: P0**

**Input:** Simple drink counter per session. Tap to add drinks, select type (beer, wine, liquor, cocktail), optionally add notes. End-of-session log.

**Display:**
- Weekly drink count + trailing 4-week trend
- Correlation view: overlay alcohol events on weight trend, sleep quality, and recovery metrics
- "Dry streak" counter (days since last drink) — this is a proven motivator
- WHOOP-style impact visualization: show the ripple effect on HR, HRV, sleep quality for the 48-72 hours following a drinking session (using actual biometric data from Health Connect)

**Modeling:** Each logged drinking session feeds into the decision-impact engine with the dose-dependent modifiers from the evidence table above. The app should be able to show: "Your last 4 weekends included drinking. Here's what 4 dry weekends would project to by [bachelor party date]."

### 4.5 Low-Friction Diet Tracking

**Priority: P0**

**Two modes, toggleable via a switch at the top of the diet log screen:**

**Mode 1: Vibes (default — the low-friction path)**

A single tap to rate your overall day. The 1-5 scale with memorable labels:

| Score | Name | What It Means | Model Estimate |
|---|---|---|---|
| 1 | 🔥 **Dumpster Fire** | Fast food, no protein focus, way too much food, regrettable choices | ~+800-1200 kcal above maintenance |
| 2 | 😬 **Meh** | Not great — skipped meals then overate, or decent base with a big splurge | ~+200-500 kcal above maintenance |
| 3 | 😐 **Cruise Control** | Normal day, nothing special, roughly what you'd expect | ~±200 kcal of maintenance |
| 4 | 💪 **Dialed In** | Protein at every meal, reasonable portions, no junk | ~-300-500 kcal deficit |
| 5 | 🎯 **Sniper Mode** | Every meal intentional, high protein, clean, perfect execution | ~-500-700 kcal deficit |

One tap, done. The app estimates a rough caloric position from the rating and feeds it into the energy balance model with appropriately wide confidence intervals. Logging a 3 every day is better than not logging at all.

**Mode 2: Meal Log (the detail-when-you-want-it path)**

Meal-by-meal entries with as much or as little detail as the user provides:

- Expandable sections: Breakfast | Lunch | Dinner | Snacks
- Each meal accepts free text at any fidelity: "eggs" or "3 scrambled eggs with toast and avocado"
- AI interprets the text into a rough quality rating and caloric estimate per meal
- Meals auto-roll up into a daily quality score (same 1-5 scale) for consistency with Vibes mode
- Users can fill in some meals and skip others — partial logging is welcomed, not penalized
- A "Quick add" option for each meal: just pick a category (home cooked / takeout / restaurant / fast food / skipped) without any description

Both modes write to the same underlying data model (daily quality score + optional meal details), so the user can switch modes day to day without breaking continuity.

**Key design decisions:**
- The app NEVER shames for choosing Vibes over Meal Log. A Vibes "3" logged consistently is worth 10x more than detailed meal logs abandoned after 3 days.
- End-of-day prompt at a configurable time (default 8pm): "How'd you eat today?" with the Vibes quick-tap visible immediately and Meal Log one toggle away.
- If no entry by end of day, mark as "not logged" — NOT as a bad day, NOT as a streak break. Just a gap.
- Weekend vs. weekday distinction is surfaced in weekly summaries — this is the single most predictive behavioral pattern from the research.
- Research shows simplified tracking achieves **equivalent weight loss outcomes** to detailed calorie counting with nearly **double the adherence rate** (97% vs 49% of days logged).

**What the app does NOT do:**
- Calorie counting
- Macro tracking
- Food database lookups
- Barcode scanning
- Portion size estimation with precision
- Any of the things that killed Zach's previous tracking attempts

### 4.6 Progress Photos

**Priority: P1 — Important but not blocking POC launch**

**Input:** Front and side profile photos, morning fasted, consistent lighting. Bi-weekly cadence (already established in coaching protocol — next check-in March 20).

**Features:**
- Ghost overlay from previous photo to guide positioning consistency
- Side-by-side comparison (swipe between dates)
- Timeline view (all photos in sequence)
- Photos paired with weight/BF% data from the same date
- On-device storage only — no cloud upload for privacy

**V2 aspirations:** AI-powered visual comparison that detects changes in shoulder-to-waist ratio, arm definition, etc. This is technically feasible (GainFrame is doing it) but not POC scope.

### 4.7 Sleep & Recovery Integration

**Priority: P1**

**Data source:** Health Connect (Fitbit → sleep stages, HR, HRV, SpO2)

**Features:**
- Nightly sleep summary: duration, stages (light/deep/REM/awake), sleep score
- 7-day and 30-day sleep trends
- Correlation overlay: sleep quality vs. next-day diet quality, sleep quality vs. next-morning weight fluctuation
- Recovery composite score (simplified WHOOP-style): combine resting HR delta from baseline, HRV delta from baseline, sleep duration vs. target, sleep efficiency. Output as a traffic-light indicator, not a proprietary score — be transparent about inputs.
- Surface the sleep-body-composition connection explicitly: "This week you averaged 6.4 hours. Research shows this shifts weight loss from ~56% fat to ~25% fat. Getting to 7.5+ hours is the highest-leverage change available."

### 4.8 Activity & Exercise Tracking

**Priority: P1**

**Data source:** Health Connect (Fitbit → steps, exercise sessions, active calories, HR zones)

**Features:**
- Daily step count with 7-day and 30-day rolling averages
- Exercise session log: type, duration, estimated calories (with caveat about wearable calorie inaccuracy of ±27-93%)
- Strength training frequency tracker: sessions this week vs. 3x target (the biggest gap in current plan)
- Running log with distance/pace trends
- Weekly training volume summary

**What it does NOT do:**
- Prescribe workouts
- Track sets/reps/weight (that's what Strong or Hevy are for)
- Generate training programs

### 4.9 Insight Chat

**Priority: P1 — Roadmap, not POC V1**

An in-app chat window where the user can ask questions about their data and get conversational explanations grounded in the decision-impact engine outputs. This is distinct from the "What if?" scenario tool — that's a structured input/output interaction. The chat is freeform.

**Examples of what a user might ask:**
- "Why did my weight spike this week?"
- "What's been different about the weeks where I actually lost weight?"
- "How much has alcohol cost me over the last month?"
- "If I keep doing what I'm doing, where will I be by August?"
- "What was my best week in the last month and what made it different?"

**Architecture:** Claude API call from within the artifact. The system prompt includes the user's recent data (weight trend, diet logs, alcohol logs, sleep, exercise) and the model's current state (TDEE estimate, projected trajectory, identified patterns). Claude interprets the data conversationally, constrained by the deterministic model outputs — it can explain and contextualize but not invent physiological claims beyond what the evidence tables support.

**Key constraint:** Every response includes confidence tier markers on factual claims. The chat is a conversational interface to the same evidence-grounded engine, not a general-purpose health chatbot.

**Why roadmap, not POC:** The core "What if?" tool validates the decision-impact concept with a simpler UX. The chat is a richer interface to the same underlying capability. Build the engine first, add the conversational layer once the engine is proven.

### 4.10 Trajectory Timeline — The Core Visual

**Priority: P0 — This IS the app. Everything else feeds into this.**

The central visualization is a **trajectory band flowing toward an objective date**, with decision point markers showing where choices bent the curve. It is not a precise graph — it's an intentionally soft, organic visual that communicates direction and momentum without implying the kind of precision the underlying data doesn't support.

**The concept:**

A smooth, gradient-filled band flows left-to-right from "now" toward a future target date (bachelor party, wedding). The band represents the range of likely body composition outcomes. The center of the band is the most likely trajectory. The width of the band represents uncertainty — it's narrow near "today" (where we have data) and widens as it projects further out (where we're estimating). The band's angle communicates momentum: trending down toward target = good, flattening = plateau, curving up = off track.

Scattered along the timeline are **decision point markers** — moments where a choice meaningfully bent the trajectory. A gym session, a dry weekend, a bad sleep night, a drinking session. Each marker visually connects to the trajectory band, showing how it nudged the curve. Good decisions pull the band tighter and steeper toward the target. Bad decisions push it wider or flatter. The markers aren't clinical data points — they're moments in a story.

**What this is NOT:**
- Not a sharp line graph with exact Y-axis values (that implies precision we don't have)
- Not a scatter plot of daily weigh-ins (that's noise, not signal)
- Not a clinical chart you'd see in a doctor's office
- Not multiple disconnected charts for different metrics

**What this IS:**
- A single, unified visual that answers: "Am I heading where I want to go, and what's bending the curve?"
- A visual narrative — you can look at it and *read* the story of your last few weeks
- Intentionally soft-edged — gradient bands, not hard lines; glowing markers, not data points
- The kind of thing you'd want to look at, not the kind of thing you'd dread opening

**Visual Language:**

```
Today                                              Bachelor Party
  │                                                      │
  │    ┌─ 🍺 4 drinks                                   │
  │    │  (band widens,         ┌─ 💪 Gym + dry Fri     │
  │    │   trajectory flattens) │  (band tightens,       │
  │    ▼                        │   curve steepens)      │
  ╔══════╗                      ▼                        │
  ║ 208  ║━━━━━━━━━━╗                                    │
  ║      ║  ░░░░░░░░║━━━━━━╗                             │
  ║      ║  ░░░░░░░░║░░░░░░║━━━━━━━━╗                   │
  ║      ║  ░░░░░░░░║░░░░░░║░░░░░░░░║━━━━━╗             │
  ║      ║  ░░░░░░░░║░░░░░░║░░░░░░░░║  ⟋  ║            │
  ║      ║  ░░░░░░░░║░░░░░░║░░░░░░░░║⟋    ╠═══ 🎯 200  │
  ║      ║  ░░░░░░░░║░░░░░░║░░░░░░░░║     ║             │
  ╚══════╝          ╚══════╝        ╚═════╝             │
                                                         │
  Past ◄──────────── Now ────────────────────► Target    │
  
  Band narrows = more certainty / momentum
  Band widens = more uncertainty / deviation
  Decision markers show what bent the curve
```

**Interaction model:**
- Tap a decision marker → expands an explanation card: what happened, what it meant physiologically, how it shifted the trajectory, evidence confidence tier
- Pinch/zoom to change time scale (last 7 days ↔ full journey to target)
- The target date has a "landing zone" — the range of outcomes the model currently projects. The landing zone shrinks as you get closer and as data accumulates.
- Swiping or scrolling moves along the timeline — past data on the left has real measurements filling the band; future projection on the right has the widening uncertainty gradient

**Color and feel:**
- The band itself uses a gradient: cool blue/green when on-track, warming toward amber/orange when drifting off-pace
- Decision markers glow subtly — positive decisions are warm (like a small ember of progress), negative ones are cool/muted (not alarming, just visible)
- The overall aesthetic should feel like looking at a river flowing toward a destination — organic, continuous, alive — not like reading a spreadsheet
- The target date marker should feel like a beacon — something you're flowing toward

**The secondary layer (below the trajectory):**

Below the main trajectory band, a condensed strip shows the contributing signals stacked as small timeline rows — the "what's driving this" view:

```
  Weight trend:  ───────────────────── (smoothed, not daily noise)
  Sleep avg:     ▃▅▇▅▃▇▇▅▃▅▇▇▇▅▃▅▇  (sparkline bars)
  Diet quality:  🎯💪😐💪🔥😬💪💪🎯  (emoji sequence)
  Alcohol:       · · · 🍺· · · · 🍺  (event markers)
  Training:      💪· · 💪· · 💪· ·   (session markers)
```

Tapping any row expands it into a full detail view. But the default is compressed — you see the whole picture at once, then drill into what matters.

**This is the visual signature of the app.** Every other fitness app shows you isolated charts. This app shows you a river — where you've been, what bent the current, and where you're flowing.

---

## 5. Architectural Overview

### 5.1 POC Architecture (Claude Mobile App)

```
┌─────────────────────────────────────────────┐
│              Claude Mobile App               │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │         React Artifact (JSX)            │ │
│  │                                         │ │
│  │  ┌──────────┐  ┌───────────────────┐   │ │
│  │  │Dashboard │  │Decision-Impact    │   │ │
│  │  │  View    │  │  Engine View      │   │ │
│  │  └────┬─────┘  └────────┬──────────┘   │ │
│  │       │    ┌────────┐   │              │ │
│  │       │    │ Chat   │   │              │ │
│  │       │    │ (Road) │   │              │ │
│  │       │    └───┬────┘   │              │ │
│  │  ┌────┴──────────────────┴──────────┐  │ │
│  │  │      State Management Layer       │  │ │
│  │  │   (React useState/useReducer)     │  │ │
│  │  └────┬──────────────────┬──────────┘  │ │
│  │       │                  │              │ │
│  │  ┌────┴─────┐    ┌──────┴──────────┐  │ │
│  │  │Persistent│    │  Claude API     │  │ │
│  │  │ Storage  │    │ (Layer 3 LLM)   │  │ │
│  │  │(Key-Val) │    │  Interpretation │  │ │
│  │  └──────────┘    └─────────────────┘  │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │     Health Connect (Native Access)       │ │
│  │  Weight | BF% | Steps | Sleep | HR | Ex │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

Data Flow:
1. Health Connect → Claude reads on conversation start
2. User inputs (diet, alcohol, photos) → Persistent Storage
3. Deterministic models (Layers 1 & 2) → Run in JS within artifact
4. LLM interpretation (Layer 3) → Claude API calls from artifact
5. All state persisted across sessions via window.storage API
```

### 5.2 Data Model (Persistent Storage)

```
Key Structure:
  config                    → User profile, targets, preferences
  weight:{YYYY-MM-DD}      → Daily weight + BF% + source
  diet:{YYYY-MM-DD}        → Diet log (quality score, description, AI estimate)
  alcohol:{YYYY-MM-DD}     → Drink count, type, session notes
  sleep:{YYYY-MM-DD}       → Sleep duration, stages, score
  activity:{YYYY-MM-DD}    → Steps, exercise sessions, calories
  vitals:{YYYY-MM-DD}      → Resting HR, HRV, recovery score
  photo:{YYYY-MM-DD}       → Photo metadata (base64 or reference)
  model-state              → Current TDEE estimate, trend calculations,
                              personalization parameters
  decision-log:{ID}        → What-if scenario logs with inputs and outputs
```

### 5.3 Computational Architecture

**Layer 1 runs entirely client-side in JavaScript within the React artifact.** This includes:
- Exponential moving average for weight smoothing
- Linear regression for trend rate calculation
- Mifflin-St Jeor BMR calculation
- TDEE back-calculation from weight trend + diet signals
- Forbes equation for body composition partitioning
- Fan chart confidence interval generation

**Layer 2 runs client-side as lookup tables + interpolation.** The evidence-based modifier tables (alcohol impact, sleep impact, exercise impact, diet deviation impact) are encoded as structured data within the artifact. Each "what-if" scenario applies the appropriate modifiers to the Layer 1 baseline projection.

**Layer 3 uses the Claude API from within the artifact** for natural-language "what-if" interpretation and explanation generation. The system prompt constrains Claude to reference only the Layer 1/2 outputs and the evidence confidence tiers — it cannot invent physiological claims.

### 5.4 Future Architecture (Web App)

```
┌──────────────────┐     ┌──────────────────┐
│   Web Frontend   │     │  Mobile Companion │
│   (React/Next)   │     │  (React Native)   │
└────────┬─────────┘     └────────┬──────────┘
         │                        │
         │    ┌───────────┐       │
         └────┤  API Layer ├──────┘
              │  (REST)   │
              └─────┬─────┘
                    │
         ┌──────────┴──────────┐
         │   Application Core   │
         │                      │
         │  ┌────────────────┐ │
         │  │ Energy Balance  │ │  ← Layer 1
         │  │    Engine       │ │
         │  └────────────────┘ │
         │  ┌────────────────┐ │
         │  │ Impact Modifier │ │  ← Layer 2
         │  │    Engine       │ │
         │  └────────────────┘ │
         │  ┌────────────────┐ │
         │  │  Claude API     │ │  ← Layer 3
         │  │  Integration    │ │
         │  └────────────────┘ │
         └──────────┬──────────┘
                    │
         ┌──────────┴──────────┐
         │     Data Layer       │
         │                      │
         │  ┌────────┐ ┌─────┐│
         │  │Fitbit   │ │ App ││
         │  │Web API  │ │ DB  ││
         │  │(OAuth)  │ │     ││
         │  └────────┘ └─────┘│
         └─────────────────────┘

Mobile companion handles:
  - Health Connect reads (weight, sleep, etc.)
  - Photo capture with positioning guide
  - Sync to backend
```

---

## 6. Weaknesses, Pitfalls & Risk Analysis

### 6.1 Model Accuracy Risks

**The fundamental tension: useful predictions require precision that the evidence doesn't support.**

The decision-impact engine models cascading effects across systems (alcohol → sleep → recovery → training quality → weekly deficit → body composition trajectory). Each link in the chain has its own error bars. When you multiply uncertain estimates across 4-5 links, the confidence interval at the end can be enormous.

Specific accuracy risks:

- **BIA scale body fat measurements have ±3-5% absolute error.** Fitdays is a foot-to-foot BIA scale — the cheaper end of consumer devices. A reading of 17.9% could actually be anywhere from 13-23%. The *trend* is more reliable than the absolute number, but even trend sensitivity is limited to ~1% changes. This means the app's body fat projections are built on imprecise foundations.

- **Diet quality estimation from free text is inherently rough.** "Pretty good day" could mean anywhere from a 500 kcal deficit to a 500 kcal surplus. The app is explicitly designed to accept this imprecision, but it means the energy balance model will have wide error margins unless the user provides more detail. The TDEE back-calculation converges over time, but requires 3-4 weeks of reasonably consistent data.

- **No human dose-response data for alcohol and muscle protein synthesis below ~12 drinks.** The Parr et al. study used 1.5 g/kg (~12 drinks). We're interpolating effects at 2-4 drinks from mechanistic reasoning and animal data, not human RCTs. The app must communicate this gap honestly.

- **Wearable calorie estimates are 27-93% inaccurate.** The app should never present Fitbit calorie burns as ground truth. They're directionally useful over weeks but unreliable on individual days.

- **Individual variation is enormous.** The Forbes equation describes population averages. Resistance training, protein intake, genetics, and hormonal status all shift the fat:lean partitioning ratio for individuals. The Bayesian personalization layer (Layer 2.5, not in POC) is designed to learn individual parameters over time, but in the POC, we're using population-level estimates with wide bands.

**Mitigation strategy:** Fan charts, confidence tiers, and explicit uncertainty language in every projection. The app's credibility depends on being right about its uncertainty, not right about its predictions.

### 6.2 Behavioral & Psychological Risks

- **Counterfactual framing can demoralize.** Research on counterfactual thinking shows that "upward counterfactuals" (imagining better alternatives) can motivate OR depress, depending on whether the person perceives the alternative as still achievable. The app must frame impacts as forward-looking opportunities, not backward-looking regrets.

- **Scale obsession.** Daily weigh-ins are non-negotiable for the model to work, but some people develop an unhealthy relationship with the scale. The app should aggressively smooth and contextualize daily fluctuations, showing the user that a 2 lb overnight gain is water, not fat.

- **Streak anxiety.** If the app implements logging streaks, a broken streak can trigger "what-the-hell" abandonment. Duolingo's solution was streak freezes + flexible weekly goals. Consider: the app tracks weekly consistency scores (5/7 days logged = green) rather than consecutive day streaks.

- **The UC variable.** Zach's ulcerative colitis is currently in secondary failure with a medication switch underway. GI flares make mornings unpredictable, affect appetite and absorption, and can change body water dramatically. The app needs a "flare mode" that adjusts expectations and suppresses normal trajectory projections during active flares. This isn't a standard fitness app feature — it's a personalization requirement.

### 6.3 Technical Risks

- **Persistent storage limitations.** The Claude artifact persistent storage API has a 5MB per key limit and is rate-limited. Storing 6 months of daily health data, diet logs, photos, and model state may push these limits. Photos especially — even compressed, a single progress photo can be several hundred KB. May need to store photo references rather than base64 data.

- **Health Connect 30-day historical limit.** On first connection, only 30 days of data are readable. For the POC, this means the app starts with limited historical context. The full Fitdays export in the coaching docs provides backstop context, but the app can't programmatically access that history.

- **Claude API latency in artifacts.** The decision-impact engine's Layer 3 (LLM interpretation) requires API calls from within the React artifact. These add latency — typically 2-5 seconds per call. The UX must handle this with loading states, and the app should precompute common scenarios rather than calling the API for every interaction.

- **No offline capability.** The Claude mobile app requires internet connectivity. If Zach wants to log something on a plane or in a dead zone, he can't. Consider: the app should accept inputs optimistically and sync/process when connectivity returns.

- **Data portability.** If Zach decides to move to a standalone app, all data in Claude's persistent storage needs to be exportable. Build an export function from day one.

### 6.4 Evidence Gaps That Affect the Model

| Gap | Impact on App | Mitigation |
|---|---|---|
| No human MPS data at low alcohol doses (2-3 drinks) | Can't precisely model the most common drinking scenario | Use "plausible but uncertain" tier, present as a range |
| No RCTs comparing binge vs. moderate drinking on body composition in humans | Pattern-of-consumption modeling relies on animal data + epidemiology | Present with appropriate uncertainty |
| Self-perceived diet quality is inaccurate 85% of the time | Free-text diet logs may be systematically biased | Cross-validate with weight trend — if weight isn't moving as predicted, the diet estimates are likely off, and the model should communicate this |
| Individual EPOC variation is enormous | Exercise calorie contributions are approximate | Don't rely on EPOC for energy balance — treat as minor bonus |
| No validated model integrating sleep quality into body composition predictions | Sleep impact estimates are directional, not precise | Present sleep insights as "evidence-supported" tier |
| Consumer BIA accuracy is ±3-5% BF | Absolute body fat targets (12-13%) may not be measurable | Focus on trend direction and rate, not absolute BF% |

### 6.5 Scope Creep Risks

The biggest risk to the POC is trying to build the full vision before validating the core concept. The temptation will be to add:
- Detailed exercise tracking (sets/reps) — that's what Strong is for
- Meal-by-meal calorie estimation — this is what killed previous tracking attempts
- Social/competitive features — no users to compete with yet
- Elaborate onboarding — the only user already knows the context
- Pixel-perfect UI — functional > beautiful for POC

**Ruthless prioritization:** The decision-impact engine is the product. Everything else is plumbing to feed it data. If a feature doesn't make the "what does this choice mean for my trajectory?" question more answerable, it's not V1.

---

## 7. Open Questions (RESOLVED — See Section 10)

*All questions below were answered on March 7, 2026. Finalized decisions are in Section 10.*

### Architecture & Scope

**Q1: How do you want to interact with this app day-to-day?**
The POC lives as a Claude artifact. That means you'd open it within a Claude conversation. Do you want: (a) a single persistent artifact you return to (like opening an app), (b) the artifact to appear when relevant during coaching conversations and I pull/push data to it, or (c) something else? This affects whether it's a standalone tool or integrated into the coaching flow.

**Q2: Do you want the "what-if" scenarios to require explicit input, or should the app proactively surface them?**
Option A: You tap a "What if?" button and describe a scenario. Option B: The app notices patterns (e.g., it's Friday at 5pm, your last 3 Fridays included drinking) and proactively shows "Here's what a dry Friday projects to..." Option C: Both. This affects complexity significantly.

**Q3: How much do you care about the web app path vs. perfecting the Claude POC?**
The web app requires Fitbit OAuth integration, a backend, and real infrastructure. We could instead invest that energy into making the Claude artifact version extremely good — it has Health Connect access, persistent storage, and Claude API. The web app adds cross-device access and prettier UI, but the core intelligence lives in the artifact regardless. Where do you want the effort?

### Data & Tracking

**Q4: Are you willing to do end-of-day diet logging every day, or is that already too much?**
The model gets dramatically better with even rough daily diet signals vs. nothing. But if it becomes another chore you skip, it's counterproductive. Would you prefer: (a) daily prompt you respond to, (b) log only when something notable happens (deviations from routine), (c) I ask you about it during coaching conversations and log it myself?

**Q5: How should alcohol logging work mechanistically?**
Options: (a) Real-time — tap a button each time you have a drink, (b) End-of-session — log total drinks + type after you're done, (c) Next-morning — recall and log the night before, (d) I ask you about it during check-ins. Real-time is most accurate but highest friction. Next-morning is lowest friction but least accurate.

**Q6: What's the Fitdays scale situation for the web app?**
Fitdays syncs to Health Connect (which Claude can read), but I don't think Fitdays has a cloud API. For the web app phase, your weight data would need to come from either: (a) Fitbit Web API (but that would require a Fitbit-compatible scale like Aria), (b) a companion Android app that reads Health Connect and syncs to your backend, or (c) manual entry. Is switching scales an option? Or is the companion app path more realistic?

### Design & UX

**Q7: What's your tolerance for notifications/nudges?**
The app could be completely passive (you open it when you want) or it could nudge you: "Hey, no weigh-in in 2 days" or "It's Friday — here's your weekend game plan." Nudges improve adherence but can feel nagging. Where's your line?

**Q8: How do you feel about the confidence tier system?**
The plan is to mark every insight with 🟢 well-established / 🟡 evidence-supported / 🔴 plausible but uncertain. Some people find this helpful for calibrating trust. Others find it cluttering and anxiety-inducing ("if it's uncertain, why show me?"). Does this approach work for you, or would you prefer a simpler "here's what we know" framing without the explicit tiers?

**Q9: Should the app know about your UC?**
We can build in a "flare mode" that adjusts expectations during GI episodes, or we can keep the app agnostic to your medical context and handle that in coaching conversations. The flare mode would be more personalized but adds complexity and raises the question of how the app detects/handles a flare (manual toggle? auto-detect from anomalous data?).

### Motivation & Framing

**Q10: How aggressive should the competitive framing be?**
Your coaching profile says competitive framing is real fuel. The app could include things like: "At current pace, you'll be at 198 lbs for the bachelor party — leaner than 92% of American men your age" or "You're 3.5 lbs ahead of where most guys would be 5 months out from a wedding." This is motivating for some people and cringeworthy for others. Where do you land?

**Q11: What's the emotional tone when things go sideways?**
When you gain 3 lbs over a weekend or skip the gym for a week, the app could: (a) Be purely clinical — "Trend shifted +0.4 lbs, here's the adjusted projection," (b) Be empathetic but direct — "Rough weekend. Here's the real damage — it's less than you think. Here's how to recover this week," (c) Be competitive — "You just gave back 10 days of progress. The math says you need 3 clean weeks to get back on pace. Let's go." Which of these do you want?

---

## 8. Development Phases

*See Section 11 for the finalized, post-decision phase plan. The original sprint-based roadmap was replaced after design decisions were locked.*

---

## 9. References

This PRD is grounded in two research reports produced during this project:

1. **Evidence Base for a Lifestyle Decision-Impact Engine** — Covers alcohol metabolism and MPS, exercise frequency and detraining, sleep and body composition, dietary deviation impacts, Forbes-Hall body composition models, BIA accuracy, uncertainty communication, and the three-layer hybrid architecture rationale.

2. **Fitness App Competitive Landscape** — Covers market segmentation, MacroFactor/Carbon/WHOOP/Oura/Noom competitive positioning, weight trend algorithms, low-friction diet tracking evidence, alcohol tracking gaps, recovery scoring systems, progress photo apps, behavioral design patterns, TDEE back-calculation technical details, and Health Connect/HealthKit integration patterns.

3. **Health Data Platform Integration Guide** — Covers Health Connect API, Fitbit Web API, Apple HealthKit, Google Fit deprecation, Samsung Health sync, data normalization, middleware services, and the phased integration strategy.

---

## 10. Finalized Design Decisions

*Locked March 7, 2026. These are binding for POC scope.*

| # | Decision | Answer | Implications |
|---|---|---|---|
| D1 | **Interaction model** | Standalone artifact (open like an app) | Build as a self-contained React artifact with full navigation. Not embedded in coaching chat flow — the coaching conversations and the app are separate contexts in the same project. |
| D2 | **Decision-impact mode** | Both proactive + reactive | Need pattern detection logic (day-of-week, recent behavior history) to generate contextual nudges on the dashboard. Also need a "What if?" input that accepts free-text scenarios. Proactive adds meaningful complexity — deprioritize behind reactive for Phase 2, layer proactive in Phase 3+. |
| D3 | **Tone when things go sideways** | Empathetic but direct (default), configurable on roadmap | V1 tone: acknowledge the deviation without judgment, show the actual (usually modest) real impact, reframe toward what recovery looks like. Store tone preference in config for future configurability. |
| D4 | **Diet logging** | Dual-mode: Vibes (1-5 tap) + Meal Log (meal-by-meal detail) | Two toggleable modes sharing one data model. Vibes is default — one-tap 1-5 scale (Dumpster Fire → Sniper Mode). Meal Log is opt-in per day for more detail. Daily prompt at 8pm. Both modes feed the same quality score into the energy balance model. |
| D5 | **Alcohol logging** | Flexible — any method | Build three input modes: (a) real-time tap-per-drink counter, (b) end-of-session batch log, (c) next-morning recall. All write to the same data model. The app doesn't enforce a method — it accepts whatever Zach actually does. Default view shows a simple "+ Add drinks" button always accessible. |
| D6 | **Evidence confidence tiers** | Show them — visible on every insight | Every decision-impact output and proactive insight includes 🟢/🟡/🔴 tier badge inline. Not hidden behind a tooltip — first-class UI element. This is a trust-building feature and a differentiator. Include a one-time explainer on first use. |
| D7 | **UC / health conditions** | Roadmap — generalized "health condition" feature | Not in POC. Roadmap item: a configurable "condition mode" system where users can define health conditions that affect expectations (UC flare, injury, illness, medication change). When active, the app adjusts trajectory projections and suppresses normal pacing alerts. |
| D8 | **Competitive framing** | Heavy — without false precision | Use timeline-based competitive language: "X days ahead of pace," "on track to be the leanest you've been since [date]," "at current rate you'll hit [milestone] by [date] — Y days before the bachelor party." Avoid percentile claims or comparisons to population distributions — those imply a precision the data doesn't support. |
| D9 | **Web app strategy** | POC-first, architect for migration | All business logic (energy balance models, impact modifiers, trend calculations) lives in pure functions with no dependency on Claude artifact APIs. Data model uses a clean interface layer over persistent storage so swapping the storage backend (artifact → IndexedDB → Postgres) requires changing one module. Export function from day one. TypeScript preferred; Python or Go also permitted for backend/tooling. |
| D10 | **Scale / Fitdays situation** | Defer — not blocking POC | POC reads weight from Health Connect (which Fitdays syncs to). Web app gap acknowledged — resolve when we get there. Options remain: Fitbit Aria, companion Android app, or CSV import. |
| D11 | **Insight chat** | Roadmap — not in POC V1 | In-app conversational interface to ask questions about data and get evidence-grounded explanations. Uses Claude API constrained by deterministic model outputs. Build the engine first (Phase 2), add chat as a richer interface once the engine is proven. |
| D12 | **Trajectory timeline** | P0 — the core visual, the app IS this | A smooth trajectory band flowing toward a target date, with decision point markers showing what bent the curve. Intentionally imprecise — gradient bands not hard lines, widening uncertainty toward the future. Not a clinical chart; a visual narrative. Decision markers are interactive (tap to expand impact explanation). Secondary layer below shows compressed sparklines of contributing signals (sleep, diet, alcohol, training). |
| D13 | **Onboarding questionnaire** | Web app — not POC | Structured intake survey for alcohol baseline, diet baseline, health metrics import/entry, exercise history import/entry. POC skips this because the user context is already established in coaching docs. Web app version needs it for cold-start users. |
| D14 | **POC purpose & handoff** | POC is a test bed; insights are the deliverable | The artifact POC exists to validate feel, density, framing, and daily usability — not to be the product. Insights from actual usage are captured continuously and compiled into a handoff document for Claude Code (via GSD) to build the web app. The handoff doc contains: what worked, what didn't, what to change, refined specs, and new requirements discovered through use. |
| D15 | **Tech stack** | TypeScript preferred, Python/Go permitted | TypeScript is the default language for all application code — models, data layer, UI. Python or Go are permitted for backend services, tooling, or data processing where they're the better fit. The Claude artifact POC uses JSX (React) since that's the artifact runtime, but business logic should be written with TypeScript portability in mind. |
| D16 | **Mobile-first design** | All screens designed for phone-in-hand | Touch targets ≥44px, single-column layouts, bottom tab navigation, horizontal swipe for timelines, no hover states, no dense tables. Mobile is the primary viewport for both the Claude artifact POC and the eventual web app. |

---

## 11. Development Phases

*No fixed timelines — phases are implemented iteratively by Claude. Each phase builds on the last and is usable on its own.*

**Ongoing across all phases: Insight Capture & Handoff Document.** Every phase produces two things: a working artifact and a section of the handoff document recording what worked, what didn't, what to change, and what was discovered. The handoff doc accumulates into the spec that Claude Code (via GSD) uses to build the web app.

### Phase 0: Skeleton & Data Model
- Define data model interfaces for all entities (TypeScript where possible, portable, not artifact-dependent)
- Define the storage key schema and read/write abstraction layer
- Build skeleton React artifact with tab navigation: Dashboard | Log | Impact | Timeline | Progress | Settings
- Implement persistent storage initialization and data loading
- Stub all views with placeholder content
- **Gate:** Artifact opens, navigates between tabs, persists state across sessions

### Phase 1: Trajectory Visual + Core Data
- **Trajectory timeline (basic):** Smooth band visualization from "now" toward target dates, using historical weight trend data. Decision markers as static dots for now (interactive expansion comes in Phase 2). Gradient band that widens toward the future. The visual feel — soft, organic, intentionally imprecise — is established here.
- Health Connect data ingestion: weight, BF%, steps, sleep, exercise, HR
- Weight trend smoothing algorithm (exponential moving average)
- Dashboard: countdowns, current stats, pace indicator, weekly scorecard, competitive milestone framing
- Diet quality logging — both modes: Vibes (1-5 tap scale) + Meal Log (meal-by-meal free text)
- Alcohol logging (flexible: tap counter + batch + recall modes)
- Secondary signal strip below trajectory (sparklines for sleep, diet, alcohol, training)
- **Gate:** A visual you want to open every day. The trajectory feels real, the logging is frictionless, the dashboard is useful.

### Phase 2: Decision-Impact Engine
- Layer 1: Energy balance model — BMR, TDEE estimate, trend-based back-calculation
- Layer 2: Impact modifier tables — alcohol, sleep, exercise, diet deviations
- **Trajectory markers become interactive** — tap a decision point to see its cascading impact explanation with confidence tiers
- The trajectory band dynamically responds to logged decisions (new alcohol entry shifts the projected band in real-time)
- Reactive "What if?" interface — describe a scenario, see how it bends the trajectory
- Layer 3: Claude API call for natural language interpretation of model outputs
- Confidence tiers (🟢/🟡/🔴) on all outputs
- **Gate:** The trajectory responds to your decisions. You can see a choice bend the curve. The impact explanations are credible and evidence-grounded.

### Phase 3: Intelligence + Polish
- Proactive pattern detection (day-of-week behavior, recent trends, plateau recognition)
- Proactive nudges on dashboard based on detected patterns
- "What changed?" auto-annotations when the trajectory shifts meaningfully
- Progress photo capture, storage, and side-by-side comparison
- Sleep and recovery detail visualization
- Weekly summary view
- Data export (JSON dump of all persistent storage)
- **Gate:** The app tells you things you didn't ask. It catches patterns you'd miss. It's a tool you'd be worse off without.

### Phase 4+: Roadmap (Post-POC → Web App Handoff)
- **Compile handoff document** — synthesize all phase insights into a complete spec for Claude Code / GSD
- **Insight chat** — in-app conversational interface for asking questions about data
- **Bayesian personalization** — learn individual response rates from accumulated data
- **Plateau detection** with historical pattern matching (reference Oct-Nov 2025 breakthrough)
- **Configurable tone system** — empathetic / clinical / competitive toggle
- **Health condition mode** — generalized system for conditions that affect trajectory (UC, injury, illness, medication changes)
- **Competitive milestone celebrations** — visual/motivational moments when milestones are crossed
- **Onboarding questionnaire** (web app) — structured intake for alcohol/diet baselines, health metrics import/entry, exercise history import/entry
- **Web app build** (Claude Code / GSD) — Fitbit OAuth integration, backend, cross-device access, refined UI based on POC learnings
