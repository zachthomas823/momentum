import { describe, it, expect } from "vitest";
import {
  scenarioImpact,
  alcoholImpact,
  sleepImpact,
  dietImpact,
  type ScenarioInput,
  type CascadeLink,
} from "@/lib/engine/index";

/**
 * Helper: compute "parallel" impact by summing independent shifts
 * (mirrors the old scenarioImpact behavior before cascading).
 */
function parallelSum(scenario: ScenarioInput): [number, number] {
  const shift: [number, number] = [0, 0];

  if (scenario.alcohol) {
    const a = alcoholImpact(scenario.alcohol);
    if (a) {
      shift[0] += a.weeklyTrajectoryShift[0];
      shift[1] += a.weeklyTrajectoryShift[1];
    }
  }

  if (scenario.sleep != null) {
    const sl = sleepImpact(scenario.sleep);
    const ki = sl.kcalIncrease;
    if (Array.isArray(ki)) {
      shift[0] += ki[0] / 3500;
      shift[1] += ki[1] / 3500;
    }
  }

  if (scenario.diet != null) {
    const d = dietImpact(scenario.diet);
    if (d) {
      shift[0] += d.weeklyTrajectoryShift[0];
      shift[1] += d.weeklyTrajectoryShift[1];
    }
  }

  return shift;
}

describe("Cascading Impact Engine", () => {
  it("cascading total > parallel total for alcohol+sleep+diet scenario", () => {
    const scenario: ScenarioInput = { alcohol: 4, sleep: 7, diet: 3 };

    const cascaded = scenarioImpact(scenario);
    const parallel = parallelSum(scenario);

    // Cascading should produce a LARGER positive shift (more slowing) than parallel
    // because alcohol degrades sleep, which increases hunger, which shifts diet worse.
    // Both lo and hi should be >= the parallel equivalent (strictly greater for at least one).
    expect(cascaded.totalWeeklyShift[0]).toBeGreaterThan(parallel[0]);
    expect(cascaded.totalWeeklyShift[1]).toBeGreaterThan(parallel[1]);
  });

  it("ranges preserved through cascade — hi - lo > 0", () => {
    const scenario: ScenarioInput = { alcohol: 4, sleep: 7, diet: 3 };
    const result = scenarioImpact(scenario);

    // Range must not collapse to a single point
    const range = result.totalWeeklyShift[1] - result.totalWeeklyShift[0];
    expect(range).toBeGreaterThan(0);
  });

  it("single-factor scenario produces identical results to parallel", () => {
    // Diet-only: no cascade should occur
    const dietOnlyScenario: ScenarioInput = { diet: 4 };
    const cascaded = scenarioImpact(dietOnlyScenario);
    const parallel = parallelSum(dietOnlyScenario);

    expect(cascaded.totalWeeklyShift[0]).toBeCloseTo(parallel[0], 10);
    expect(cascaded.totalWeeklyShift[1]).toBeCloseTo(parallel[1], 10);
    expect(cascaded.cascadeChain).toBeUndefined();
  });

  it("no cascade when alcohol < 3", () => {
    const scenario: ScenarioInput = { alcohol: 2, sleep: 7 };
    const cascaded = scenarioImpact(scenario);
    const parallel = parallelSum(scenario);

    // Should match parallel — no alcohol→sleep cascade below 3 drinks
    expect(cascaded.totalWeeklyShift[0]).toBeCloseTo(parallel[0], 10);
    expect(cascaded.totalWeeklyShift[1]).toBeCloseTo(parallel[1], 10);
    expect(cascaded.cascadeChain).toBeUndefined();
  });

  it("cascadeChain populated with correct links", () => {
    const scenario: ScenarioInput = { alcohol: 4, sleep: 7, diet: 3 };
    const result = scenarioImpact(scenario);

    expect(result.cascadeChain).toBeDefined();
    expect(result.cascadeChain!.length).toBeGreaterThanOrEqual(1);

    // First link: alcohol → sleep
    const alcoholToSleep = result.cascadeChain!.find(
      (link: CascadeLink) => link.from === "alcohol" && link.to === "sleep"
    );
    expect(alcoholToSleep).toBeDefined();
    expect(alcoholToSleep!.mechanism).toContain("REM");
    expect(alcoholToSleep!.degradation[0]).toBeGreaterThan(0);
    expect(alcoholToSleep!.degradation[1]).toBeGreaterThanOrEqual(
      alcoholToSleep!.degradation[0]
    );

    // Second link: sleep → diet (should exist because degraded sleep < 7h)
    const sleepToDiet = result.cascadeChain!.find(
      (link: CascadeLink) => link.from === "sleep" && link.to === "diet"
    );
    expect(sleepToDiet).toBeDefined();
    expect(sleepToDiet!.mechanism).toContain("hunger");
  });

  it("weekly-pattern timeScale produces different result than single-event", () => {
    const scenario: ScenarioInput = { alcohol: 4, sleep: 7, diet: 3 };

    const singleEvent = scenarioImpact(scenario, "single-event");
    const weeklyPattern = scenarioImpact(scenario, "weekly-pattern", 2);

    // Weekly pattern with 2 days/week should differ from single-event
    expect(weeklyPattern.totalWeeklyShift[0]).not.toEqual(
      singleEvent.totalWeeklyShift[0]
    );
    expect(weeklyPattern.timeScale).toBe("weekly-pattern");
    expect(singleEvent.timeScale).toBe("single-event");

    // Weekly pattern at freq=2 → factor = 2/7 applied
    const factor = 2 / 7;
    expect(weeklyPattern.totalWeeklyShift[0]).toBeCloseTo(
      singleEvent.totalWeeklyShift[0] * factor,
      6
    );
    expect(weeklyPattern.totalWeeklyShift[1]).toBeCloseTo(
      singleEvent.totalWeeklyShift[1] * factor,
      6
    );
  });

  it("6+ drinks produce larger sleep degradation than 3-5", () => {
    const moderate: ScenarioInput = { alcohol: 4, sleep: 7 };
    const heavy: ScenarioInput = { alcohol: 7, sleep: 7 };

    const modResult = scenarioImpact(moderate);
    const heavyResult = scenarioImpact(heavy);

    const modLink = modResult.cascadeChain!.find(
      (l) => l.from === "alcohol" && l.to === "sleep"
    )!;
    const heavyLink = heavyResult.cascadeChain!.find(
      (l) => l.from === "alcohol" && l.to === "sleep"
    )!;

    // Heavy drinking degrades sleep more
    expect(heavyLink.degradation[0]).toBeGreaterThanOrEqual(
      modLink.degradation[0]
    );
    expect(heavyLink.degradation[1]).toBeGreaterThanOrEqual(
      modLink.degradation[1]
    );
  });

  it("exercise-only scenario has no cascade chain", () => {
    const scenario: ScenarioInput = {
      exercise: { type: "strength", duration: 45 },
    };
    const result = scenarioImpact(scenario);

    expect(result.cascadeChain).toBeUndefined();
    expect(result.effects.length).toBe(1);
    expect(result.effects[0].category).toBe("exercise");
  });

  it("sleep-only scenario (no alcohol) has no cascade", () => {
    const scenario: ScenarioInput = { sleep: 6 };
    const cascaded = scenarioImpact(scenario);
    const parallel = parallelSum(scenario);

    expect(cascaded.totalWeeklyShift[0]).toBeCloseTo(parallel[0], 10);
    expect(cascaded.totalWeeklyShift[1]).toBeCloseTo(parallel[1], 10);
    expect(cascaded.cascadeChain).toBeUndefined();
  });
});
