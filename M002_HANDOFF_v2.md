# M002 Handoff: Auth, Configurable Goals & AI Personas

## What This Milestone Is

Lock down the app behind authentication, move hardcoded goals/milestones/constants into a database-backed settings page, and add an AI persona system that changes how Claude talks to you. The app stays single-user. No multi-tenancy, no onboarding flow for strangers, no engine generalization.

**Predecessor:** M001 (Web App Build) — complete. App is live and in daily use.

**Design constraint:** A friend or two might try this someday. Auth should support multiple accounts (not a hardcoded password), but data isolation, user-scoped queries, and engine generalization are out of scope. If friends want their own instance, that's a future milestone.

---

## Scope Summary

| In | Out |
|----|-----|
| Auth gate (login required for all routes) | Multi-tenancy / user_id on every table |
| Configurable goals & milestones (DB-backed, editable from settings) | Onboarding flow for new users |
| AI persona system (Coach / Buddy / Analyst) | Feature toggles (alcohol, photos, etc.) |
| Settings page for goals, milestones, persona, biometrics | Engine generalization (UserContext parameter on all functions) |
| Claude prompt templatization with persona | Wearable provider abstraction |
| | Account lifecycle (deletion, export, GDPR) |
| | Unit conversion (imperial/metric) |
| | Rate limiting |

---

## What's Hardcoded Today That Moves to DB

| Item | Current Location | Moves To |
|------|-----------------|----------|
| Target dates (Bachelor Party 8/20, Wedding 9/5) | `lib/engine/constants.ts` | `milestones` table |
| Target weights (205, 202.6, 200, 196) | `lib/engine/constants.ts` + dashboard | `milestones` table |
| BMR inputs (age, sex, height, activity level) | `lib/engine/constants.ts` | `user_profile` table |
| Dashboard countdown cards | `app/(tabs)/` dashboard | Query `milestones` table |
| Dashboard competitive taglines | `app/(tabs)/` dashboard | Generated from `milestones` data |
| Claude system prompt (name, specific framing) | API routes | Template + persona from `user_profile` table |
| Competitive framing milestones (R019) | Dashboard components | Query `milestones` table |

Items that stay as code constants (evidence-based, not personal):
- Alcohol impact tiers, sleep impact tiers, diet tier kcal deltas
- Cascade chain logic (alcohol→sleep→hunger→diet)
- Confidence tier definitions
- EMA smoothing parameters

---

## Architecture Decisions for M002

| # | Scope | Decision | Choice | Rationale | Revisable? |
|---|-------|----------|--------|-----------|------------|
| D011 | auth | Auth approach | Auth.js v5 with email/password. No social OAuth yet. | Need real auth (not a hardcoded password) so additional accounts are possible later. Auth.js is native to Next.js App Router. Email/password is sufficient for a personal tool with maybe 1-2 friends. | Yes — add social OAuth if needed |
| D012 | auth | Session strategy | JWT (stateless) | Serverless-friendly. No session store. | No |
| D013 | auth | Registration model | Closed registration. No public sign-up page. Accounts created manually via seed script or admin route. | This is a personal tool, not a product. You create accounts for yourself and anyone you explicitly invite. | Yes — add invite flow if friend onboarding becomes real |
| D014 | arch | Supersedes D003 | Auth model changes from no-auth to Auth.js with login wall. | D003 was marked "Yes — if multi-user added." Even for single-user lockdown, a real auth gate is needed. | No |
| D015 | data | Config storage | New `user_profile` and `milestones` tables. Single row in `user_profile`. Multiple rows in `milestones`. | These replace hardcoded constants. Queryable from engine callers and API routes. Editable from settings UI. | Yes — add user_id columns if multi-user happens |
| D016 | ai | Persona system | Three personas (Coach, Buddy, Analyst) stored in `user_profile.ai_persona`. Maps to Claude system prompt template. | Research found 2 of 15+ fitness apps offer this. Costs almost nothing to implement (prompt templates) but meaningfully changes the experience. | Yes — add/refine personas |
| D017 | data | Migration approach | Seed existing constants into new tables. Engine callers read from DB instead of constants file. Constants file becomes defaults/fallbacks only. | No data migration needed — existing health/log tables untouched. Just moving config values from code to DB. | No |

---

## New Tables

```sql
-- Personal profile (single row — no user_id needed)
CREATE TABLE user_profile (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL DEFAULT 'Zach',
  age             INT NOT NULL,
  sex             TEXT NOT NULL,                    -- 'male' | 'female'
  height_inches   NUMERIC NOT NULL,
  activity_level  TEXT NOT NULL DEFAULT 'moderate',  -- sedentary | light | moderate | active | very_active
  ai_persona      TEXT NOT NULL DEFAULT 'coach',     -- 'coach' | 'buddy' | 'analyst'
  timezone        TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Goals and milestones (replaces hardcoded target dates/weights)
CREATE TABLE milestones (
  id              SERIAL PRIMARY KEY,
  label           TEXT NOT NULL,          -- 'Wedding', 'Bachelor Party', 'Under 200'
  milestone_type  TEXT NOT NULL,          -- 'event' | 'weight' | 'bf_pct'
  target_date     DATE,                   -- nullable: weight milestones may not have dates
  target_value    NUMERIC,                -- nullable: events may not have weight targets
  is_primary      BOOLEAN DEFAULT false,  -- primary goal drives trajectory destination
  sort_order      INT NOT NULL DEFAULT 0, -- display ordering
  achieved_at     TIMESTAMPTZ,            -- set when milestone is hit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Seed Data (from current constants)

```sql
INSERT INTO user_profile (name, age, sex, height_inches, activity_level, ai_persona, timezone)
VALUES ('Zach', 33, 'male', 72, 'moderate', 'coach', 'America/Los_Angeles');

INSERT INTO milestones (label, milestone_type, target_date, target_value, is_primary, sort_order) VALUES
  ('Bachelor Party', 'event', '2026-08-20', 200, false, 1),
  ('Wedding', 'event', '2026-09-05', 196, true, 2),
  ('Under 205', 'weight', NULL, 205, false, 3),
  ('All-Time Lean', 'weight', NULL, 202.6, false, 4),
  ('Under 200', 'weight', NULL, 200, false, 5);
```

### Existing Tables — No Changes

All 10 existing data tables (`weight_logs`, `sleep_logs`, `activity_logs`, `heart_rate_logs`, `diet_logs`, `alcohol_logs`, `fitbit_tokens`, `sync_history`, `scenarios`, `photos`) remain exactly as they are. No `user_id` column added. No schema changes.

---

## Requirements

### R030 — Auth Gate
- Class: core-capability
- Status: active
- Description: Auth.js v5 integration with email/password. Login page at `/login`. Middleware protects all routes — unauthenticated requests redirect to login. No public sign-up page. Accounts created via seed script or protected admin API route. JWT sessions.
- Why it matters: The app is currently open to anyone with the URL. Health data should be behind a login.
- Primary owning slice: M002/S01
- Validation: Unauthenticated visit to any route → redirected to `/login`. After login → normal app experience. No public registration path.

### R031 — Configurable Goals & Milestones
- Class: core-capability
- Status: active
- Description: New `milestones` table replaces hardcoded target dates and weights. Dashboard countdown cards, trajectory destination, competitive framing, and milestone celebration cards all read from this table. Settings page allows CRUD on milestones: add new goal/event, edit existing, mark achieved, reorder, delete. Engine callers that reference target dates/weights query `milestones` instead of constants. Primary milestone drives trajectory band destination.
- Why it matters: Wedding date changes, new goals emerge, milestones get hit. These shouldn't require a code change and deploy.
- Primary owning slice: M002/S02
- Validation: Change primary milestone target weight in settings → trajectory destination updates. Add new event milestone → countdown card appears on dashboard. Mark milestone achieved → celebration state renders, milestone stops driving projections.
- Notes: The `is_primary` flag determines which milestone the trajectory band flows toward. Only one milestone should be primary at a time (enforce in UI, not DB constraint). Achieved milestones stay in the table for historical context but stop affecting projections.

### R032 — Configurable Profile (Biometrics)
- Class: core-capability
- Status: active
- Description: New `user_profile` table replaces hardcoded BMR inputs. Single row containing name, age, sex, height, activity level, timezone, and AI persona preference. API routes that call engine functions read BMR inputs from this table instead of constants. Settings page allows editing all fields. Changes trigger recalculation of BMR/TDEE/projections on next dashboard load.
- Why it matters: Age changes every year. Activity level changes with training phases. These are inputs to every engine calculation.
- Primary owning slice: M002/S02
- Validation: Change activity level in settings from 'moderate' to 'active' → TDEE increases → projected pace recalculates on next dashboard load.

### R033 — AI Persona System
- Class: differentiator
- Status: active
- Description: Three AI personas that change how Claude communicates. **Coach**: accountability-forward, calls out patterns directly, pushes. "You had 6 drinks Saturday and your sleep cratered. That's a 3-day recovery hole. What's the plan?" **Buddy**: supportive, normalizing, celebrates wins. "Rough weekend — happens. Good news: you've bounced back faster than this before." **Analyst**: numbers-first, minimal editorializing. "Weekend impact: +1,400 kcal estimated surplus, sleep efficiency dropped 22%, 7-day EMA: 187.3 lbs." Persona stored in `user_profile.ai_persona`. Switchable from settings. Affects all three Claude entry points (Ask Anything, Momentum Analysis, Photo Analysis) and pattern nudge card copy. Does NOT affect engine calculations, evidence tables, confidence tiers, or core philosophy (forward framing, ranges, no false precision).
- Why it matters: Different moods want different framing. This was already identified as R023 (deferred in M001) — now implemented properly.
- Primary owning slice: M002/S03
- Validation: Switch persona to Analyst → ask "what if I have 4 beers tonight" → data-forward response with numbers. Switch to Coach → same question → accountability-forward response. Both contain the same underlying impact data and confidence tiers.
- Notes: Supersedes R023 (Configurable Tone System) from M001 deferred backlog.

### R034 — Claude Prompt Templatization
- Class: core-capability
- Status: active
- Description: All three Claude entry points use `buildSystemPrompt()` to assemble prompts from: base philosophy (hardcoded — this is the soul of the app), persona block (from `user_profile.ai_persona`), active milestones (from `milestones` table), and user name (from `user_profile.name`). Replaces current hardcoded system prompts that reference "Zach" and specific dates.
- Why it matters: System prompts currently have hardcoded name, dates, and milestone weights baked in. Moving these to template variables means Claude's context stays current when you change goals in settings.
- Primary owning slice: M002/S03
- Validation: Change primary milestone in settings → next Claude response references the new goal. Change name in profile → Claude addresses by the updated name.

### R035 — Settings Page
- Class: primary-user-loop
- Status: active
- Description: New settings page (or expanded existing settings) with three sections. **Profile**: edit name, age, sex, height, activity level, timezone. **Goals & Milestones**: CRUD milestones, set primary, reorder, mark achieved. **AI Persona**: select Coach/Buddy/Analyst with preview text showing example responses. Existing settings (Fitbit connection, data export) remain. All changes persist immediately and reflect on next page load.
- Why it matters: This is the whole point of the milestone — making the personal configuration layer editable from the UI.
- Primary owning slice: M002/S02
- Validation: Edit every field → navigate to dashboard → changes reflected in engine outputs, countdowns, Claude responses, and competitive framing.

### Requirement Status Changes from M001

| ID | M001 Status | M002 Status | Change |
|----|-------------|-------------|--------|
| R023 | deferred | superseded by R033 | Configurable Tone → AI Persona System |
| R026 | out-of-scope | remains out-of-scope | Multi-user is NOT what M002 does. Auth gate ≠ multi-tenancy. |

---

## Slice Plan

### M002/S01 — Auth Gate
**Goal:** No unauthenticated access to the app. Login required.

**Work:**
1. Install and configure Auth.js v5 for App Router
2. Create `login` page with email/password form
3. Add middleware to protect all routes (redirect to `/login` if no session)
4. Create seed script or admin API route to create accounts (no public sign-up)
5. Create your account, verify login → full app access
6. Verify: visit any route without session → redirect to login

**Risk:** Low. Additive — no existing code changes, just a new layer in front.

**Done when:** Unauthenticated visit → login page. After login → normal app. No public registration.

---

### M002/S02 — Configurable Profile, Goals & Settings Page
**Goal:** Replace hardcoded constants with DB-backed values editable from a settings page.

**Work:**
1. Create Drizzle schemas for `user_profile` and `milestones` tables
2. Push schema to Neon, run seed data (current hardcoded values)
3. Build settings page with three sections:
   - Profile editor (name, age, sex, height, activity level, timezone)
   - Milestones manager (add/edit/delete/reorder milestones, set primary, mark achieved)
   - AI Persona selector (preview cards — wired in S03)
4. Create API routes: `GET/PUT /api/settings/profile`, `GET/POST/PUT/DELETE /api/settings/milestones`
5. Refactor engine callers in API routes:
   - `getProfile()` query replaces hardcoded constants for BMR inputs
   - `getMilestones()` query replaces hardcoded target dates/weights
   - Engine functions themselves stay unchanged — callers pass DB values as arguments
6. Refactor dashboard to query `milestones` table for:
   - Countdown cards (event milestones with dates)
   - Trajectory destination (primary milestone's target weight)
   - Competitive framing copy (dynamic from milestones, not hardcoded strings)
   - Milestone celebration triggers (weight milestones)
7. Refactor `lib/date-utils.ts` to read timezone from profile instead of hardcoded constant
8. Update existing tests — mock `getProfile()` / `getMilestones()` instead of importing constants directly

**Risk:** Medium. Touches the engine's input path and dashboard rendering. The engine stays pure functions but its *callers* change how they get inputs. Timezone change from hardcoded → DB-backed affects every day-boundary calculation.

**Done when:** Change a milestone in settings → dashboard reflects it without deploy. Change activity level → TDEE recalculates. All existing tests pass.

---

### M002/S03 — AI Persona System & Prompt Templatization
**Goal:** Claude's personality adapts to your persona preference. Prompts stay current with your goals.

**Work:**
1. Create `lib/claude/personas.ts` with three prompt templates:
   - `COACH_PROMPT` — direct, pattern-calling, accountability framing
   - `BUDDY_PROMPT` — supportive, normalizing, celebration-oriented
   - `ANALYST_PROMPT` — data-forward, minimal editorializing
2. Create `lib/claude/prompt-builder.ts` with `buildSystemPrompt()`:
   - Loads base philosophy (hardcoded — universal, non-negotiable)
   - Loads persona block from `user_profile.ai_persona`
   - Loads active milestones from `milestones` table
   - Loads user name from `user_profile.name`
   - Assembles into complete system prompt
3. Update `/api/impact/analyze` to use `buildSystemPrompt()` instead of hardcoded prompt
4. Update `/api/weekly/analysis` to use `buildSystemPrompt()` — momentum analysis tone matches persona
5. Update `/api/photos/analyze` to use `buildSystemPrompt()`
6. Update pattern nudge card copy in `lib/patterns/index.ts` to include persona-aware framing:
   - Coach: "Your weekend alcohol pattern is killing Monday recovery."
   - Buddy: "Weekends have been heavier on drinks lately — might be worth noticing."
   - Analyst: "Alcohol consumption concentrated on weekends: 78% of weekly drinks on Fri-Sun."
7. Wire persona selector in settings (from S02) to `user_profile.ai_persona`
8. Add persona preview cards to settings: show same example scenario in all three voices

**Risk:** Low-medium. Prompt engineering requires iteration to get the three voices distinct but equally useful. Pattern nudge copy is the most work — 8 detectors × 3 personas = 24 copy variants.

**Done when:** Switch persona → next Claude response matches the new voice. Pattern nudge cards reflect the persona. All three voices contain the same underlying data and confidence tiers.

---

## Slice Dependencies

```
M002/S01 (Auth Gate)
    │
    └── M002/S02 (Profile, Goals, Settings)
            │
            └── M002/S03 (AI Personas & Prompt Templatization)
```

S01 is standalone and can ship independently — the app works exactly as before, just behind a login. S02 creates the tables and settings page that S03's persona system reads from. S03 can't wire `buildSystemPrompt()` until S02's `getProfile()` and `getMilestones()` queries exist.

---

## Files Created or Significantly Modified

### New Files
```
app/(auth)/login/page.tsx              — Login page
lib/auth/config.ts                     — Auth.js configuration
lib/claude/personas.ts                 — Three persona prompt templates
lib/claude/prompt-builder.ts           — buildSystemPrompt() assembler
lib/db/settings-queries.ts             — getProfile(), getMilestones(), upserts
app/api/settings/profile/route.ts      — Profile CRUD
app/api/settings/milestones/route.ts   — Milestones CRUD
scripts/seed-profile.ts               — Seed initial profile + milestones from current constants
scripts/create-account.ts             — Create auth account (no public registration)
```

### Significantly Modified Files
```
middleware.ts                          — Auth check on all routes
lib/db/schema.ts                       — Add user_profile + milestones schemas
lib/engine/constants.ts                — Personal values extracted; evidence tables stay
lib/date-utils.ts                      — Read timezone from profile query
lib/patterns/index.ts                  — Persona-aware nudge copy (3 variants per detector)
app/(tabs)/page.tsx (dashboard)        — Countdowns from milestones query, dynamic competitive framing
components/Trajectory.tsx              — Target destination from primary milestone query
app/api/impact/analyze/route.ts        — Use buildSystemPrompt()
app/api/weekly/analysis/route.ts       — Use buildSystemPrompt()
app/api/photos/analyze/route.ts        — Use buildSystemPrompt()
components/Shell.tsx                   — Add settings tab/link
```

### Untouched
```
lib/engine/index.ts                    — Engine functions unchanged (pure functions, same signatures)
lib/db/queries.ts                      — Health data queries unchanged (no user_id scoping)
lib/fitbit/*                           — Fitbit integration unchanged
lib/claude/fitness-tools.ts            — MCP tools unchanged (still single-user data)
All 10 existing data tables            — No schema changes
```

---

## Open Questions

| # | Question | Leaning | Notes |
|---|----------|---------|-------|
| O1 | Should engine functions change their signature to accept profile data as params, or should callers query the DB and feed values to unchanged engine functions? | Callers query, engine unchanged | Keeps the engine pure and avoids a refactor of all 14 functions + 29 tests. The callers already assemble data — they just read profile from DB instead of constants. Engine stays testable with hardcoded inputs. |
| O2 | Should the `config` table (already exists in schema) be reused for profile data, or create a new `user_profile` table? | New table | `config` is a key-value bag. Profile data is structured (age, sex, height). A typed table with columns is better for validation and querying. |
| O3 | Pattern nudge copy: 8 detectors × 3 personas = 24 variants. Hand-write all 24 or generate dynamically via Claude at render time? | Hand-write | Nudge cards should be instant (no API call). 24 copy strings is tedious but finite and gives full control over tone. Revisit if persona count grows. |
| O4 | Milestone "achieved" state: auto-detect from weight data or manual toggle? | Both | Auto-detect when a weigh-in crosses a weight milestone threshold. Manual toggle for event milestones (you went to the bachelor party) or to override auto-detection. |

---

## Success Criteria

M002 is done when:

1. Visiting any route without being logged in redirects to login.
2. Changing a milestone target date or weight in settings reflects on the dashboard without redeploying.
3. Switching AI persona in settings changes how Claude responds to the same question.
4. All 29 existing tests pass — engine logic is unchanged.
5. Pattern nudge cards match the selected persona's tone.
6. The words "Bachelor Party," "Wedding," "Zach," "196," "202.6" appear nowhere in source code except the seed script.
