// ─── Decision-Impact Engine (Layer 1 + Layer 2) ─────────────────────────────
// Pure functions ported from POC app.jsx, adapted for flat DayRecord shape.
// No React, no DB — these are portable computation modules.

import { TARGETS, DIET } from "./constants";
import type { DayRecord } from "@/lib/db/queries";

// ─── Impact Return Types ─────────────────────────────────────────────────────

export interface AlcoholImpact {
  fatOxSuppression: [number, number];
  fatOxDuration: string;
  mpsImpact: string;
  mpsConf: string;
  sleepImpact: string;
  recoveryHrs: [number, number];
  kcalAdded: [number, number];
  realFatGain: [number, number];
  scaleImpact: [number, number];
  scaleNote: string;
  weeklyTrajectoryShift: [number, number];
  trajectoryUnit: string;
  duration: string;
  conf: string;
  summary: string;
}

export interface SleepImpact {
  fatRatio: [number, number];
  kcalIncrease: number | [number, number];
  mpsImpact: string;
  summary: string;
  conf: string;
  good: boolean | null;
}

export interface ExerciseImpact {
  kcalBurned: [number, number];
  epoc: [number, number];
  mpsBoost: string;
  weeklyTrajectoryShift: [number, number];
  summary: string;
  conf: string;
  good: boolean;
}

export interface DietImpact {
  kcalDelta: [number, number];
  weeklyTrajectoryShift: [number, number];
  summary: string;
  conf: string;
  good: boolean | null;
}

export interface PaceResult {
  rate: number;
  source: string;
  confidence: string;
  dataPoints?: number;
}

export interface ProjectionResult {
  center: number;
  low: number;
  high: number;
}

export interface TdeePipelineResult {
  bmr: number;
  tdee: number;
  avgSteps: number;
}

export interface MilestoneResult {
  icon: string;
  label: string;
}

export interface CascadeLink {
  from: string;      // e.g. "alcohol"
  to: string;        // e.g. "sleep"
  mechanism: string;  // e.g. "REM disruption reduces effective sleep"
  degradation: [number, number];  // e.g. [1.0, 1.5] hours of sleep lost
}

export interface ScenarioInput {
  alcohol?: number;
  sleep?: number;
  diet?: number;
  exercise?: { type: string; duration: number };
}

interface ScenarioEffect {
  category: string;
  summary: string;
  conf: string;
  good?: boolean | null;
  weeklyTrajectoryShift?: [number, number];
  [key: string]: unknown;
}

export interface ScenarioResult {
  effects: ScenarioEffect[];
  totalWeeklyShift: [number, number];
  direction: string;
  severity: string;
  daysEquiv: [number, number];
  isPositive: boolean;
  isNegative: boolean;
  cascadeChain?: CascadeLink[];
  timeScale?: 'single-event' | 'weekly-pattern';
}

export interface CompareResult {
  a: ScenarioResult;
  b: ScenarioResult;
  labelA: string;
  labelB: string;
}

// ─── Layer 1: Energy Balance ─────────────────────────────────────────────────

/** Mifflin-St Jeor BMR for males. */
export function bmr(weightLbs: number, heightIn: number, age: number): number {
  const kg = weightLbs * 0.4536;
  const cm = heightIn * 2.54;
  return 10 * kg + 6.25 * cm - 5 * age - 5;
}

/** Simple TDEE estimate from BMR and average daily steps. */
export function tdeeEstimate(bmrVal: number, stepsAvg: number): number {
  if (stepsAvg > 12000) return bmrVal * 1.55;
  if (stepsAvg > 8000) return bmrVal * 1.45;
  if (stepsAvg > 5000) return bmrVal * 1.35;
  return bmrVal * 1.25;
}

/** Weekly deficit from TDEE and average diet quality score. */
export function weeklyDeficit(tdee: number, dietScoreAvg: number): number {
  const dietMap: Record<number, number> = { 1: 1000, 2: 350, 3: 0, 4: -400, 5: -600 };
  const dailyDelta = dietMap[Math.round(dietScoreAvg)] || 0;
  return (tdee - (tdee + dailyDelta)) * 7; // negative = deficit
}

/** Project weight forward with uncertainty cone. */
export function projectedWeight(
  currentLbs: number,
  weeklyLossRate: number,
  weeksOut: number
): ProjectionResult {
  const center = currentLbs - weeklyLossRate * weeksOut;
  const uncertainty = 0.3 * weeksOut; // ±0.3 lbs per week of projection
  return {
    center: Math.max(center, 170),
    low: Math.max(center - uncertainty, 170),
    high: center + uncertainty,
  };
}

// ─── EMA Smoothing ───────────────────────────────────────────────────────────

/** Exponential moving average for weight trend smoothing. */
export function ema(values: number[], alpha: number = 0.15): number[] {
  if (!values.length) return [];
  const result = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
  }
  return result;
}

// ─── Pace Derivation ─────────────────────────────────────────────────────────

/**
 * Derive actual weekly loss rate from weight data using EMA smoothing.
 * Adapted for flat DayRecord shape (d.weightLbs, not d.weight?.lbs).
 */
export function derivedPace(days: DayRecord[]): PaceResult {
  const wDays = days.filter((d) => d.weightLbs != null);
  if (wDays.length < 2) {
    return { rate: TARGETS.weeklyPaceLbs, source: "default", confidence: "low" };
  }

  const smoothed = ema(wDays.map((d) => d.weightLbs!));
  const first3 = smoothed.slice(0, Math.min(3, smoothed.length));
  const last3 = smoothed.slice(-Math.min(3, smoothed.length));
  const avgFirst = first3.reduce((a, b) => a + b, 0) / first3.length;
  const avgLast = last3.reduce((a, b) => a + b, 0) / last3.length;

  const daySpan =
    (new Date(wDays[wDays.length - 1].date).getTime() -
      new Date(wDays[0].date).getTime()) /
    864e5;
  if (daySpan < 3) {
    return { rate: TARGETS.weeklyPaceLbs, source: "default", confidence: "low" };
  }

  const rate = (avgFirst - avgLast) / (daySpan / 7);
  return {
    rate: Math.max(-1, Math.min(rate, 3)),
    source: "derived",
    confidence: wDays.length >= 6 ? "high" : "mod",
    dataPoints: wDays.length,
  };
}

// ─── TDEE Pipeline ───────────────────────────────────────────────────────────

/**
 * Connect BMR → steps → TDEE from current weight and recent day records.
 * Adapted for flat DayRecord shape (d.steps, not d.activity?.steps).
 */
export function tdeePipeline(
  currentWeight: number,
  days: DayRecord[]
): TdeePipelineResult {
  const bmrVal = bmr(currentWeight, TARGETS.height, TARGETS.age);
  const stepDays = days.filter((d) => d.steps != null);
  const avgSteps = stepDays.length
    ? stepDays.reduce((a, d) => a + d.steps!, 0) / stepDays.length
    : 7000;
  const tdee = tdeeEstimate(bmrVal, avgSteps);
  return { bmr: bmrVal, tdee, avgSteps: Math.round(avgSteps) };
}

// ─── Milestone Detection ─────────────────────────────────────────────────────

export function checkMilestones(currentWeight: number): MilestoneResult[] {
  const milestones: MilestoneResult[] = [];
  const lost = TARGETS.startWeight - currentWeight;

  if (lost >= 3) milestones.push({ icon: "📉", label: `${lost.toFixed(1)} lbs down from start` });
  if (lost >= 5) milestones.push({ icon: "🔥", label: "5+ lbs down" });
  if (lost >= 10) milestones.push({ icon: "🔟", label: "Double digits down" });
  if (currentWeight <= 205) milestones.push({ icon: "⚡", label: "Broke 205" });
  if (currentWeight <= 202.6) milestones.push({ icon: "👑", label: "New all-time lean (beat Sep 2024)" });
  if (currentWeight <= TARGETS.bachelorParty.weight)
    milestones.push({ icon: "🎉", label: "Bachelor party weight — nailed it" });
  if (currentWeight <= TARGETS.wedding.weight)
    milestones.push({ icon: "💍", label: "Wedding weight achieved" });

  return milestones;
}

// ─── Layer 2: Impact Modifiers ───────────────────────────────────────────────

export function alcoholImpact(drinkCount: number): AlcoholImpact | null {
  if (drinkCount === 0) return null;

  if (drinkCount <= 2) {
    return {
      fatOxSuppression: [20, 40],
      fatOxDuration: "4-6 hrs",
      mpsImpact: "Likely minimal",
      mpsConf: "low",
      sleepImpact: "Mild REM reduction",
      recoveryHrs: [8, 16],
      kcalAdded: [200, 350],
      realFatGain: [0.02, 0.06],
      scaleImpact: [0.3, 0.8],
      scaleNote: "Mostly water retention",
      weeklyTrajectoryShift: [0.03, 0.08],
      trajectoryUnit: "lbs",
      duration: "~12 hrs",
      conf: "mod",
      summary: `${drinkCount} drinks — modest impact. Fat burning pauses for a few hours, slight sleep disruption. Back to baseline by tomorrow.`,
    };
  }

  if (drinkCount <= 5) {
    return {
      fatOxSuppression: [50, 70],
      fatOxDuration: "6-8 hrs",
      mpsImpact: "10-20% reduction",
      mpsConf: "low",
      sleepImpact: "Significant REM disruption",
      recoveryHrs: [24, 40],
      kcalAdded: [500, 900],
      realFatGain: [0.08, 0.18],
      scaleImpact: [1.0, 2.5],
      scaleNote: "Water + glycogen — resolves in 2-3 days",
      weeklyTrajectoryShift: [0.1, 0.25],
      trajectoryUnit: "lbs",
      duration: "24-36 hrs",
      conf: "mod",
      summary: `${drinkCount} drinks — noticeable impact. Fat burning halted for most of the evening, meaningful sleep disruption, elevated resting HR for 1-2 days. Recovery takes about 2 days of clean behavior.`,
    };
  }

  return {
    fatOxSuppression: [73, 79],
    fatOxDuration: "8+ hrs",
    mpsImpact: "24-37% reduction (Parr et al.)",
    mpsConf: "high",
    sleepImpact: "Major architecture disruption",
    recoveryHrs: [48, 72],
    kcalAdded: [900, 1800],
    realFatGain: [0.2, 0.45],
    scaleImpact: [2, 5],
    scaleNote: "Water + glycogen + inflammation — 3-5 day recovery",
    weeklyTrajectoryShift: [0.3, 0.55],
    trajectoryUnit: "lbs",
    duration: "48-72 hrs",
    conf: "high",
    summary: `${drinkCount} drinks — significant impact. Fat oxidation suppressed ~75% for 8+ hours, muscle protein synthesis reduced by a quarter to a third, sleep architecture disrupted. Full recovery takes 3-5 days. This is the pattern that stalled progress Aug-Sep 2025.`,
  };
}

export function sleepImpact(hours: number): SleepImpact {
  if (hours >= 8) {
    return {
      fatRatio: [50, 60],
      kcalIncrease: 0,
      mpsImpact: "Baseline",
      summary: `${hours.toFixed(1)}h sleep — optimal. Weight loss during deficit is ~56% fat. Recovery and hormone profile at their best.`,
      conf: "high",
      good: true,
    };
  }

  if (hours >= 7) {
    return {
      fatRatio: [40, 50],
      kcalIncrease: [100, 200],
      mpsImpact: "Modest reduction",
      summary: `${hours.toFixed(1)}h sleep — adequate but not optimal. Slightly more hunger tomorrow, fat-to-muscle loss ratio shifts a bit unfavorably.`,
      conf: "mod",
      good: null,
    };
  }

  if (hours >= 5.5) {
    return {
      fatRatio: [20, 35],
      kcalIncrease: [300, 450],
      mpsImpact: "-18% MPS",
      summary: `${hours.toFixed(1)}h sleep — this hurts. Research shows weight loss at this duration is only ~25% fat vs ~56% at 8+ hours. Expect +300-450 kcal of hunger-driven eating tomorrow. Muscle protein synthesis drops ~18%.`,
      conf: "high",
      good: false,
    };
  }

  return {
    fatRatio: [10, 25],
    kcalIncrease: [400, 600],
    mpsImpact: "Significant reduction",
    summary: `${hours.toFixed(1)}h sleep — rough night. The body shifts hard toward muscle breakdown during deficit, hunger hormones spike, insulin sensitivity drops measurably. One night is recoverable; this pattern chronically is the biggest silent progress killer.`,
    conf: "mod",
    good: false,
  };
}

export function exerciseImpact(type: string, durationMin: number): ExerciseImpact {
  const kcalPerMin = type === "strength" ? 6.5 : type === "run" ? 10 : 4;
  const kcal: [number, number] = [
    Math.round(kcalPerMin * durationMin * 0.8),
    Math.round(kcalPerMin * durationMin * 1.2),
  ];
  const epoc: [number, number] = type === "strength" ? [30, 60] : [15, 30];

  return {
    kcalBurned: kcal,
    epoc,
    mpsBoost: type === "strength" ? "Elevated 24-36 hrs" : "Minimal",
    weeklyTrajectoryShift: [
      -(kcal[0] + epoc[0]) / 3500,
      -(kcal[1] + epoc[1]) / 3500,
    ],
    summary:
      type === "strength"
        ? `${durationMin} min strength session — burned roughly ${kcal[0]}-${kcal[1]} kcal plus ${epoc[0]}-${epoc[1]} kcal afterburn. Muscle protein synthesis elevated for 24-36 hours. This is the highest-leverage activity for recomp.`
        : `${durationMin} min ${type} — burned roughly ${kcal[0]}-${kcal[1]} kcal. Good for deficit, modest afterburn.`,
    conf: "high",
    good: true,
  };
}

export function dietImpact(score: number): DietImpact | null {
  const d = DIET[score];
  if (!d) return null;

  return {
    kcalDelta: d.kcalDelta,
    weeklyTrajectoryShift: [d.kcalDelta[0] / 3500, d.kcalDelta[1] / 3500],
    summary:
      score >= 4
        ? `${d.name} day — you're in deficit. Every day like this compounds. At this pace the trajectory steepens.`
        : score === 3
          ? `${d.name} — maintenance zone. Not gaining, not losing. Fine occasionally, but too many of these flatten the trajectory.`
          : `${d.name} day — surplus territory. The actual fat impact of one day is small (${(Math.abs(d.kcalDelta[0]) / 3500).toFixed(2)}-${(Math.abs(d.kcalDelta[1]) / 3500).toFixed(2)} lbs), but the scale will overreact with water/glycogen. Recoverable in 2-3 clean days.`,
    conf: "high",
    good: score >= 4 ? true : score <= 2 ? false : null,
  };
}

// ─── Scenario Analysis (S04) ────────────────────────────────────────────────

/** Compute combined impact of a multi-factor scenario with causal cascading. */
export function scenarioImpact(
  scenario: ScenarioInput,
  timeScale: 'single-event' | 'weekly-pattern' = 'single-event',
  frequencyPerWeek: number = 1
): ScenarioResult {
  const effects: ScenarioEffect[] = [];
  const totalWeeklyShift: [number, number] = [0, 0];
  const cascadeChain: CascadeLink[] = [];

  const addShift = (lo: number, hi: number) => {
    totalWeeklyShift[0] += lo;
    totalWeeklyShift[1] += hi;
  };

  // ── Track cascade state ──────────────────────────────────────────────────
  // These get mutated as cascade links feed downstream effects
  let effectiveSleepLo = scenario.sleep ?? 0;
  let effectiveSleepHi = scenario.sleep ?? 0;
  let effectiveDietScore = scenario.diet ?? 0;
  let hasSleepCascade = false;
  let hasDietCascade = false;

  // ── Alcohol (cascade source) ─────────────────────────────────────────────
  if (scenario.alcohol) {
    const a = alcoholImpact(scenario.alcohol);
    if (a) {
      effects.push({ ...a, category: "alcohol" });
      addShift(a.weeklyTrajectoryShift[0], a.weeklyTrajectoryShift[1]);

      // Cascade: alcohol → sleep degradation (only if sleep is specified and drinks ≥ 3)
      if (scenario.sleep != null && scenario.alcohol >= 3) {
        let sleepDegLo: number;
        let sleepDegHi: number;

        if (scenario.alcohol <= 5) {
          sleepDegLo = 1.0;
          sleepDegHi = 1.5;
        } else {
          sleepDegLo = 1.5;
          sleepDegHi = 2.0;
        }

        effectiveSleepLo = scenario.sleep - sleepDegHi; // worst-case sleep = subtract hi degradation
        effectiveSleepHi = scenario.sleep - sleepDegLo; // best-case sleep = subtract lo degradation
        hasSleepCascade = true;

        cascadeChain.push({
          from: "alcohol",
          to: "sleep",
          mechanism: "REM disruption reduces effective sleep",
          degradation: [sleepDegLo, sleepDegHi],
        });
      }
    }
  }

  // ── Sleep (may use degraded hours from cascade) ──────────────────────────
  if (scenario.sleep != null) {
    if (hasSleepCascade) {
      // Cascading: compute sleep impact with degraded hours for lo and hi paths
      const slLo = sleepImpact(effectiveSleepLo); // worst-case sleep hours → worst impact
      const slHi = sleepImpact(effectiveSleepHi); // best-case sleep hours → milder impact

      // Use worst impact for hi shift, milder for lo shift
      const kiLo = slHi.kcalIncrease; // milder degradation → conservative kcal
      const kiHi = slLo.kcalIncrease; // worse degradation → worse kcal

      const kcalLo = Array.isArray(kiLo) ? kiLo[0] : (kiLo as number);
      const kcalHi = Array.isArray(kiHi) ? kiHi[1] : (kiHi as number);

      addShift(kcalLo / 3500, kcalHi / 3500);

      // Use the worst-case sleep impact for the effect display
      effects.push({ ...slLo, category: "sleep" });

      // Cascade: degraded sleep → diet quality (if diet specified and effective sleep < 7h)
      if (scenario.diet != null && effectiveSleepLo < 7) {
        const hungerKcalMidLo = kcalLo;
        const hungerKcalMidHi = kcalHi;

        // Each 250 kcal surplus from hunger shifts diet score down ~1 tier
        const dietShiftLo = Math.floor(hungerKcalMidLo / 250);
        const dietShiftHi = Math.floor(hungerKcalMidHi / 250);

        // Shift diet score down (lower is worse; clamp to 1)
        const effectiveDietLo = Math.max(1, scenario.diet - dietShiftHi);
        const effectiveDietHi = Math.max(1, scenario.diet - dietShiftLo);
        effectiveDietScore = effectiveDietLo; // track for reference
        hasDietCascade = true;

        cascadeChain.push({
          from: "sleep",
          to: "diet",
          mechanism: "Sleep-deprived hunger increases caloric intake",
          degradation: [dietShiftLo, dietShiftHi],
        });

        // Use cascaded diet scores instead of raw
        const dLo = dietImpact(effectiveDietLo);
        const dHi = dietImpact(effectiveDietHi);
        if (dLo && dHi) {
          effects.push({ ...dLo, category: "diet" });
          // lo path: use worst diet's hi shift; hi path: use worst diet's hi shift
          addShift(dHi.weeklyTrajectoryShift[0], dLo.weeklyTrajectoryShift[1]);
        } else if (dLo) {
          effects.push({ ...dLo, category: "diet" });
          addShift(dLo.weeklyTrajectoryShift[0], dLo.weeklyTrajectoryShift[1]);
        }
      }
    } else {
      // No cascade — use raw sleep hours (identical to old behavior)
      const sl = sleepImpact(scenario.sleep);
      effects.push({ ...sl, category: "sleep" });
      const ki = sl.kcalIncrease;
      const avg: [number, number] = Array.isArray(ki)
        ? [ki[0] / 3500, ki[1] / 3500]
        : [0, 0];
      addShift(avg[0], avg[1]);
    }
  }

  // ── Diet (non-cascaded path, only if not already handled by cascade) ─────
  if (scenario.diet != null && !hasDietCascade) {
    const d = dietImpact(scenario.diet);
    if (d) {
      effects.push({ ...d, category: "diet" });
      addShift(d.weeklyTrajectoryShift[0], d.weeklyTrajectoryShift[1]);
    }
  }

  // ── Exercise (independent — never part of cascade) ───────────────────────
  if (scenario.exercise) {
    const e = exerciseImpact(scenario.exercise.type, scenario.exercise.duration);
    effects.push({ ...e, category: "exercise" });
    addShift(e.weeklyTrajectoryShift[0], e.weeklyTrajectoryShift[1]);
  }

  // ── Time-scale multiplier ────────────────────────────────────────────────
  // single-event: shift is already per-event, divide by 7 for weekly impact (1 day / 7)
  // weekly-pattern: multiply per-event shift by frequency/7
  if (timeScale === 'weekly-pattern') {
    const factor = frequencyPerWeek / 7;
    totalWeeklyShift[0] *= factor;
    totalWeeklyShift[1] *= factor;
  }

  // ── Classify overall direction ───────────────────────────────────────────
  const avgShift = (totalWeeklyShift[0] + totalWeeklyShift[1]) / 2;
  let direction: string;
  let severity: string;

  if (avgShift <= -0.15) {
    direction = "accelerates";
    severity = "meaningfully";
  } else if (avgShift <= -0.05) {
    direction = "helps";
    severity = "modestly";
  } else if (avgShift <= 0.05) {
    direction = "neutral";
    severity = "";
  } else if (avgShift <= 0.15) {
    direction = "slows";
    severity = "modestly";
  } else if (avgShift <= 0.3) {
    direction = "slows";
    severity = "noticeably";
  } else {
    direction = "stalls";
    severity = "significantly";
  }

  // Convert to "clean days equivalent"
  const cleanDayValue = 0.07; // ~0.07 lbs/day in deficit on a Dialed In day
  const daysEquiv: [number, number] = [
    Math.abs(totalWeeklyShift[0] / cleanDayValue),
    Math.abs(totalWeeklyShift[1] / cleanDayValue),
  ];

  return {
    effects,
    totalWeeklyShift,
    direction,
    severity,
    daysEquiv,
    isPositive: avgShift < -0.02,
    isNegative: avgShift > 0.05,
    cascadeChain: cascadeChain.length > 0 ? cascadeChain : undefined,
    timeScale,
  };
}

/** Compare two scenarios side-by-side. */
export function compareNarrative(
  scenarioA: ScenarioInput,
  scenarioB: ScenarioInput,
  labels?: [string, string],
  timeScale?: 'single-event' | 'weekly-pattern',
  frequencyPerWeek?: number
): CompareResult {
  const impA = scenarioImpact(scenarioA, timeScale, frequencyPerWeek);
  const impB = scenarioImpact(scenarioB, timeScale, frequencyPerWeek);
  return {
    a: impA,
    b: impB,
    labelA: labels?.[0] || "Option A",
    labelB: labels?.[1] || "Option B",
  };
}
