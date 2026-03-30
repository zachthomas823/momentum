import { describe, it, expect } from "vitest";
import {
  tdeePipeline,
  derivedPace,
  checkMilestones,
  bmr,
} from "@/lib/engine/index";
import { daysTo } from "@/lib/engine/constants";
import type { DayRecord } from "@/lib/db/queries";

// ─── Test Helpers ────────────────────────────────────────────────────────────

/** Create a minimal DayRecord stub with only the fields the engine reads. */
function makeDayRecord(overrides: Partial<DayRecord> = {}): DayRecord {
  return {
    date: "2026-03-20",
    weightLbs: null,
    bodyFatPct: null,
    sleepTotalHours: null,
    sleepDeep: null,
    sleepRem: null,
    sleepAwake: null,
    steps: null,
    activeMinutes: null,
    exerciseType: null,
    exerciseDuration: null,
    strengthSession: null,
    dietScore: null,
    dietMode: null,
    totalDrinks: null,
    drinkDetails: null,
    restingHr: null,
    hrv: null,
    notes: null,
    ...overrides,
  };
}

// ─── tdeePipeline ────────────────────────────────────────────────────────────

describe("tdeePipeline with explicit profile params", () => {
  it("uses provided height and age for BMR calculation", () => {
    const days = [makeDayRecord({ steps: 8000 })];
    const result = tdeePipeline(200, days, { height: 72, age: 28 });

    // Verify BMR matches the expected Mifflin-St Jeor calculation
    const expectedBmr = bmr(200, 72, 28);
    expect(result.bmr).toBeCloseTo(expectedBmr, 5);
    expect(result.tdee).toBeGreaterThan(result.bmr);
  });

  it("different height/age produces different BMR (negative test)", () => {
    const days = [makeDayRecord({ steps: 8000 })];

    const tallYoung = tdeePipeline(200, days, { height: 76, age: 25 });
    const shortOlder = tdeePipeline(200, days, { height: 66, age: 40 });

    // Taller + younger should have higher BMR
    expect(tallYoung.bmr).toBeGreaterThan(shortOlder.bmr);
    expect(tallYoung.tdee).toBeGreaterThan(shortOlder.tdee);
  });

  it("falls back to 7000 avg steps when no step data", () => {
    const days = [makeDayRecord()]; // no steps
    const result = tdeePipeline(200, days, { height: 72, age: 28 });

    // 7000 steps → 1.35 multiplier
    const expectedBmr = bmr(200, 72, 28);
    expect(result.tdee).toBeCloseTo(expectedBmr * 1.35, 0);
    expect(result.avgSteps).toBe(7000);
  });
});

// ─── derivedPace ─────────────────────────────────────────────────────────────

describe("derivedPace with explicit defaultPace", () => {
  it("returns provided defaultPace when <2 data points (negative test)", () => {
    const days = [makeDayRecord({ weightLbs: 200, date: "2026-03-20" })];

    const result = derivedPace(days, 0.75);
    expect(result.rate).toBe(0.75);
    expect(result.source).toBe("default");
    expect(result.confidence).toBe("low");
  });

  it("returns 0.5 as defaultPace when none specified", () => {
    const days: DayRecord[] = [];
    const result = derivedPace(days);
    expect(result.rate).toBe(0.5);
  });

  it("returns custom defaultPace when daySpan < 3", () => {
    // Two days close together — daySpan < 3
    const days = [
      makeDayRecord({ weightLbs: 200, date: "2026-03-20" }),
      makeDayRecord({ weightLbs: 199, date: "2026-03-21" }),
    ];
    const result = derivedPace(days, 1.0);
    expect(result.rate).toBe(1.0);
    expect(result.source).toBe("default");
  });

  it("derives pace from real weight data over sufficient span", () => {
    // Simulate ~2 lbs loss over 14 days
    const days: DayRecord[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date("2026-03-07");
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      days.push(
        makeDayRecord({
          weightLbs: 208 - i * 0.15, // gradual decline
          date: dateStr,
        })
      );
    }
    const result = derivedPace(days, 0.5);
    expect(result.source).toBe("derived");
    expect(result.confidence).toBe("high"); // 14 data points
    expect(result.rate).toBeGreaterThan(0);
    expect(result.rate).toBeLessThan(3);
  });
});

// ─── checkMilestones ─────────────────────────────────────────────────────────

describe("checkMilestones with explicit milestones array and startWeight", () => {
  const userMilestones = [
    { label: "Bachelor party weight", targetWeight: 200, icon: "🎉" },
    { label: "Wedding weight", targetWeight: 196, icon: "💍" },
  ];

  it("returns weight-loss milestones based on startWeight", () => {
    const results = checkMilestones(202, userMilestones, 208.6);
    // 208.6 - 202 = 6.6 lbs lost → should get 3+ and 5+ milestones
    const labels = results.map((m) => m.label);
    expect(labels).toContainEqual(expect.stringContaining("lbs down from start"));
    expect(labels).toContain("5+ lbs down");
  });

  it("returns target-based milestones when weight is at or below target", () => {
    const results = checkMilestones(199, userMilestones, 208.6);
    const labels = results.map((m) => m.label);
    // At 199, both 200 and no 196 target → only bachelor party
    expect(labels).toContain("Bachelor party weight");
    expect(labels).not.toContain("Wedding weight");
  });

  it("returns all milestones when well below all targets", () => {
    const results = checkMilestones(190, userMilestones, 208.6);
    const labels = results.map((m) => m.label);
    expect(labels).toContain("Bachelor party weight");
    expect(labels).toContain("Wedding weight");
    expect(labels).toContain("Double digits down"); // 18.6 lbs lost
  });

  it("returns only weight-loss milestones with empty milestones array (negative test)", () => {
    const results = checkMilestones(200, [], 210);
    // 10 lbs lost → should get 3+, 5+, and double digits
    expect(results.length).toBe(3);
    expect(results.every((m) => !m.label.includes("party") && !m.label.includes("wedding"))).toBe(true);
    const labels = results.map((m) => m.label);
    expect(labels).toContainEqual(expect.stringContaining("lbs down"));
    expect(labels).toContain("5+ lbs down");
    expect(labels).toContain("Double digits down");
  });

  it("returns empty array when no milestones hit", () => {
    const results = checkMilestones(210, userMilestones, 210);
    // 0 lbs lost, above all targets
    expect(results).toEqual([]);
  });

  it("uses correct startWeight for dynamic milestones", () => {
    // Different startWeights produce different "X lbs down" labels
    const results220 = checkMilestones(215, [], 220); // 5 lbs lost
    const results225 = checkMilestones(215, [], 225); // 10 lbs lost

    const labels220 = results220.map((m) => m.label);
    const labels225 = results225.map((m) => m.label);

    expect(labels220).toContain("5+ lbs down");
    expect(labels220).not.toContain("Double digits down");
    expect(labels225).toContain("Double digits down");
  });
});

// ─── daysTo ──────────────────────────────────────────────────────────────────

describe("daysTo with optional timezone parameter", () => {
  it("accepts a timezone parameter without error", () => {
    // Just ensure it doesn't throw with an explicit timezone
    const result = daysTo("2030-01-01", "America/New_York");
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThan(0);
  });

  it("defaults to America/Los_Angeles when no timezone given", () => {
    const withDefault = daysTo("2030-01-01");
    const withExplicit = daysTo("2030-01-01", "America/Los_Angeles");
    expect(withDefault).toBe(withExplicit);
  });

  it("different timezones can produce different day counts near midnight", () => {
    // This is a structural test — the function signature accepts timezone.
    // Actual difference depends on current time relative to midnight boundaries.
    const la = daysTo("2030-01-01", "America/Los_Angeles");
    const tokyo = daysTo("2030-01-01", "Asia/Tokyo");
    // They might differ by 1 depending on current time, or be equal
    expect(Math.abs(la - tokyo)).toBeLessThanOrEqual(1);
  });
});
