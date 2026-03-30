import { describe, it, expect } from "vitest";
import { detectAll, type Persona } from "@/lib/patterns";
import type { DayRecord } from "@/lib/db/queries";

// ─── Test Data Helpers ───────────────────────────────────────────────────────

/** Generate a date string N days ago from a reference date. */
function daysAgo(n: number, ref = "2026-03-29"): string {
  const d = new Date(ref + "T12:00:00");
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Create a minimal DayRecord with overrides. */
function makeDay(overrides: Partial<DayRecord> & { date: string }): DayRecord {
  return {
    date: overrides.date,
    weightLbs: overrides.weightLbs ?? null,
    bodyFatPct: overrides.bodyFatPct ?? null,
    bmi: overrides.bmi ?? null,
    sleepTotalHours: overrides.sleepTotalHours ?? null,
    sleepDeepMin: overrides.sleepDeepMin ?? null,
    sleepLightMin: overrides.sleepLightMin ?? null,
    sleepRemMin: overrides.sleepRemMin ?? null,
    sleepWakeMin: overrides.sleepWakeMin ?? null,
    sleepEfficiency: overrides.sleepEfficiency ?? null,
    steps: overrides.steps ?? null,
    caloriesOut: overrides.caloriesOut ?? null,
    activeMinutes: overrides.activeMinutes ?? null,
    strengthSession: overrides.strengthSession ?? null,
    run: overrides.run ?? null,
    walk: overrides.walk ?? null,
    restingHr: overrides.restingHr ?? null,
    hrvRmssd: overrides.hrvRmssd ?? null,
    dietScore: overrides.dietScore ?? null,
    dietMode: overrides.dietMode ?? null,
    totalDrinks: overrides.totalDrinks ?? null,
    dry: overrides.dry ?? null,
  };
}

// ─── Fixture: 14 days with weekend alcohol pattern, training gap, logging ────

function buildWeekendAlcoholDays(): DayRecord[] {
  // 14 days: heavy weekend drinks, zero weekday drinks → triggers #1
  const days: DayRecord[] = [];
  for (let i = 13; i >= 0; i--) {
    const dateStr = daysAgo(i);
    const dayOfWeek = new Date(dateStr + "T12:00:00").getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
    days.push(
      makeDay({
        date: dateStr,
        totalDrinks: isWeekend ? 5 : 0,
        dietScore: 4,
        weightLbs: 205,
        sleepTotalHours: 7.5,
        strengthSession: false,
      })
    );
  }
  return days;
}

// ─── Fixture: dry streak of 7 days ──────────────────────────────────────────

function buildDryStreakDays(): DayRecord[] {
  const days: DayRecord[] = [];
  for (let i = 13; i >= 0; i--) {
    days.push(
      makeDay({
        date: daysAgo(i),
        totalDrinks: i >= 7 ? 3 : 0, // first 7 had drinks, last 7 are dry
        dry: i < 7,
        weightLbs: 205,
        dietScore: 3,
        sleepTotalHours: 7,
      })
    );
  }
  return days;
}

// ─── Fixture: plateau (flat weight over 10+ days) ───────────────────────────

function buildPlateauDays(): DayRecord[] {
  const days: DayRecord[] = [];
  for (let i = 13; i >= 0; i--) {
    days.push(
      makeDay({
        date: daysAgo(i),
        weightLbs: 205 + Math.random() * 0.3, // within 0.3 lbs
        dietScore: 3,
        sleepTotalHours: 7,
        totalDrinks: 0,
      })
    );
  }
  return days;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("persona-aware nudges", () => {
  describe("persona produces different body text", () => {
    const days = buildWeekendAlcoholDays();

    it("coach body differs from analyst body", () => {
      const coachNudges = detectAll(days, "coach");
      const analystNudges = detectAll(days, "analyst");
      // Both should produce nudges
      expect(coachNudges.length).toBeGreaterThan(0);
      expect(analystNudges.length).toBeGreaterThan(0);
      // Find a matching type/title pair
      const coachFirst = coachNudges[0];
      const analystMatch = analystNudges.find(
        (n) => n.title === coachFirst.title
      );
      expect(analystMatch).toBeDefined();
      expect(analystMatch!.body).not.toBe(coachFirst.body);
    });

    it("coach body differs from buddy body", () => {
      const coachNudges = detectAll(days, "coach");
      const buddyNudges = detectAll(days, "buddy");
      expect(buddyNudges.length).toBeGreaterThan(0);
      const coachFirst = coachNudges[0];
      const buddyMatch = buddyNudges.find((n) => n.title === coachFirst.title);
      expect(buddyMatch).toBeDefined();
      expect(buddyMatch!.body).not.toBe(coachFirst.body);
    });

    it("all 3 personas produce distinct body text for at least one detector", () => {
      const personas: Persona[] = ["coach", "buddy", "analyst"];
      const results = personas.map((p) => detectAll(days, p));

      // Find a title common to all 3
      const commonTitles = results[0]
        .map((n) => n.title)
        .filter((title) =>
          results.every((nudges) => nudges.some((n) => n.title === title))
        );
      expect(commonTitles.length).toBeGreaterThan(0);

      const title = commonTitles[0];
      const bodies = results.map(
        (nudges) => nudges.find((n) => n.title === title)!.body
      );
      // All 3 bodies should be distinct
      const uniqueBodies = new Set(bodies);
      expect(uniqueBodies.size).toBe(3);
    });
  });

  describe("default persona is coach", () => {
    it("detectAll with no persona arg matches coach explicitly", () => {
      const days = buildWeekendAlcoholDays();
      const defaultResult = detectAll(days);
      const coachResult = detectAll(days, "coach");
      expect(defaultResult.length).toBe(coachResult.length);
      for (let i = 0; i < defaultResult.length; i++) {
        expect(defaultResult[i].body).toBe(coachResult[i].body);
        expect(defaultResult[i].title).toBe(coachResult[i].title);
      }
    });
  });

  describe("no personal history dates in nudge body", () => {
    const fixtures = [
      { name: "weekend alcohol", days: buildWeekendAlcoholDays() },
      { name: "dry streak", days: buildDryStreakDays() },
      { name: "plateau", days: buildPlateauDays() },
    ];

    const personas: Persona[] = ["coach", "buddy", "analyst"];

    for (const { name, days } of fixtures) {
      for (const persona of personas) {
        it(`${name} / ${persona} — no personal history dates`, () => {
          const nudges = detectAll(days, persona);
          for (const nudge of nudges) {
            expect(nudge.body).not.toMatch(/Aug-Sep 2025/);
            expect(nudge.body).not.toMatch(/Oct-Nov 2025/);
            expect(nudge.body).not.toMatch(/2024-25/);
          }
        });
      }
    }
  });

  describe("type, icon, title, priority are persona-invariant", () => {
    it("same data produces same structural fields across personas", () => {
      const days = buildWeekendAlcoholDays();
      const coachNudges = detectAll(days, "coach");
      const analystNudges = detectAll(days, "analyst");
      const buddyNudges = detectAll(days, "buddy");

      // Same number of nudges
      expect(coachNudges.length).toBe(analystNudges.length);
      expect(coachNudges.length).toBe(buddyNudges.length);

      for (let i = 0; i < coachNudges.length; i++) {
        expect(coachNudges[i].type).toBe(analystNudges[i].type);
        expect(coachNudges[i].type).toBe(buddyNudges[i].type);
        expect(coachNudges[i].icon).toBe(analystNudges[i].icon);
        expect(coachNudges[i].icon).toBe(buddyNudges[i].icon);
        expect(coachNudges[i].priority).toBe(analystNudges[i].priority);
        expect(coachNudges[i].priority).toBe(buddyNudges[i].priority);
      }
    });
  });
});
