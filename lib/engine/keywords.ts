// ─── Local Keyword Parser (S04 T02) ──────────────────────────────────────────
// Handles ~90% of "What if?" queries locally without Claude API.
// Regex routing classifies queries into single-factor handlers that call the
// engine impact functions and assemble structured responses.

import {
  alcoholImpact,
  sleepImpact,
  exerciseImpact,
  dietImpact,
  scenarioImpact,
} from "@/lib/engine";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KeywordResponse {
  summary: string;
  relatableEquiv: string;       // e.g. "Could undo 3-4 clean days"
  mechanismChain: string[];     // e.g. ["Fat oxidation paused 6-8h", ...]
  confidence: string;           // "high" | "mod" | "low"
  trajectoryShift?: [number, number];
  category: string;             // which handler matched
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CLEAN_DAY_VALUE = 0.07; // ~0.07 lbs deficit per clean (Dialed In) day

/** Convert a weekly trajectory shift [lo, hi] into a clean-days framing string. */
function toRelatableEquiv(shift: [number, number], positive: boolean): string {
  const daysLo = Math.abs(shift[0]) / CLEAN_DAY_VALUE;
  const daysHi = Math.abs(shift[1]) / CLEAN_DAY_VALUE;
  const lo = Math.round(daysLo * 10) / 10;
  const hi = Math.round(daysHi * 10) / 10;

  if (positive) {
    return `Worth about ${lo.toFixed(1)}–${hi.toFixed(1)} extra clean days of progress`;
  }
  return `Could offset ${lo.toFixed(1)}–${hi.toFixed(1)} clean days of progress`;
}

// ─── Route Patterns ──────────────────────────────────────────────────────────
// Order matters — first match wins.

type RouteHandler = (
  query: string,
  match: RegExpMatchArray,
  context?: { currentWeight?: number; pace?: number }
) => KeywordResponse | null;

interface Route {
  pattern: RegExp;
  handler: RouteHandler;
}

// ── Alcohol Handler ──────────────────────────────────────────────────────────

const handleAlcohol: RouteHandler = (_query, match) => {
  const count = parseInt(match[1], 10);
  if (count <= 0 || count > 30) return null;

  const impact = alcoholImpact(count);
  if (!impact) return null;

  const scenario = scenarioImpact({ alcohol: count });

  const mechanismChain: string[] = [
    `Fat oxidation suppressed ${impact.fatOxSuppression[0]}–${impact.fatOxSuppression[1]}% for ${impact.fatOxDuration}`,
    impact.sleepImpact,
  ];
  if (count >= 3) {
    mechanismChain.push(`Muscle protein synthesis: ${impact.mpsImpact}`);
  }
  mechanismChain.push(
    `Recovery window: ${impact.recoveryHrs[0]}–${impact.recoveryHrs[1]} hours — then you're back on track`
  );

  return {
    summary: impact.summary,
    relatableEquiv: toRelatableEquiv(impact.weeklyTrajectoryShift, false),
    mechanismChain,
    confidence: impact.conf,
    trajectoryShift: scenario.totalWeeklyShift,
    category: "alcohol",
  };
};

// ── Sleep Handler ────────────────────────────────────────────────────────────

const handleSleep: RouteHandler = (_query, match) => {
  const hours = parseFloat(match[1] || match[2]);
  if (isNaN(hours) || hours <= 0 || hours > 16) return null;

  const impact = sleepImpact(hours);
  const scenario = scenarioImpact({ sleep: hours });

  const mechanismChain: string[] = [];

  if (impact.good === true) {
    mechanismChain.push(`Fat ratio during weight loss: ${impact.fatRatio[0]}–${impact.fatRatio[1]}% — optimal`);
    mechanismChain.push(`Muscle protein synthesis: ${impact.mpsImpact}`);
    mechanismChain.push("Hunger hormones well-regulated — easier to stick to plan");
  } else {
    mechanismChain.push(
      `Fat ratio drops to ${impact.fatRatio[0]}–${impact.fatRatio[1]}% — more muscle lost per lb`
    );
    if (Array.isArray(impact.kcalIncrease)) {
      mechanismChain.push(
        `Hunger-driven eating increases ${impact.kcalIncrease[0]}–${impact.kcalIncrease[1]} kcal tomorrow`
      );
    }
    mechanismChain.push(`Muscle protein synthesis: ${impact.mpsImpact}`);
    mechanismChain.push("One night is recoverable — prioritize sleep tomorrow to bounce back");
  }

  const shift = scenario.totalWeeklyShift;
  const isPositive = hours >= 8;

  return {
    summary: impact.summary,
    relatableEquiv: toRelatableEquiv(shift, isPositive),
    mechanismChain,
    confidence: impact.conf,
    trajectoryShift: shift,
    category: "sleep",
  };
};

// ── Exercise Handler (strength) ──────────────────────────────────────────────

const handleExerciseStrength: RouteHandler = () => {
  const duration = 50; // default gym session
  const impact = exerciseImpact("strength", duration);
  const scenario = scenarioImpact({ exercise: { type: "strength", duration } });

  return {
    summary: impact.summary,
    relatableEquiv: toRelatableEquiv(impact.weeklyTrajectoryShift, true),
    mechanismChain: [
      `Burns ${impact.kcalBurned[0]}–${impact.kcalBurned[1]} kcal during session`,
      `Afterburn (EPOC): ${impact.epoc[0]}–${impact.epoc[1]} kcal additional`,
      `${impact.mpsBoost} — this drives the recomp effect`,
      "Highest-leverage activity for preserving muscle during deficit",
    ],
    confidence: impact.conf,
    trajectoryShift: scenario.totalWeeklyShift,
    category: "exercise",
  };
};

// ── Exercise Handler (cardio) ────────────────────────────────────────────────

const handleExerciseCardio: RouteHandler = () => {
  const duration = 30; // default run
  const impact = exerciseImpact("run", duration);
  const scenario = scenarioImpact({ exercise: { type: "run", duration } });

  return {
    summary: impact.summary,
    relatableEquiv: toRelatableEquiv(impact.weeklyTrajectoryShift, true),
    mechanismChain: [
      `Burns ${impact.kcalBurned[0]}–${impact.kcalBurned[1]} kcal`,
      `Modest afterburn: ${impact.epoc[0]}–${impact.epoc[1]} kcal`,
      "Good for deepening deficit and cardiovascular health",
    ],
    confidence: impact.conf,
    trajectoryShift: scenario.totalWeeklyShift,
    category: "exercise",
  };
};

// ── Diet Handler ─────────────────────────────────────────────────────────────

const handleDiet: RouteHandler = (query) => {
  // Infer diet quality score from keywords
  let score = 3; // default to cruise control
  const q = query.toLowerCase();

  if (/dialed|clean|strict|sniper/.test(q)) {
    score = 4;
  } else if (/cruise|normal|regular|ok/.test(q)) {
    score = 3;
  } else if (/cheat|bad|meh|indulge|splurge/.test(q)) {
    score = 2;
  } else if (/dumpster|binge|terrible|awful/.test(q)) {
    score = 1;
  }

  const impact = dietImpact(score);
  if (!impact) return null;

  const scenario = scenarioImpact({ diet: score });
  const isPositive = score >= 4;

  const mechanismChain: string[] = [
    `Caloric delta: ${impact.kcalDelta[0] > 0 ? "+" : ""}${impact.kcalDelta[0]} to ${impact.kcalDelta[1] > 0 ? "+" : ""}${impact.kcalDelta[1]} kcal`,
  ];

  if (isPositive) {
    mechanismChain.push("Deficit deepens — each day like this compounds");
    mechanismChain.push("Glycogen stays low — scale reflects real progress");
  } else if (score <= 2) {
    mechanismChain.push("Glycogen replenishment causes temporary scale spike — not real fat");
    mechanismChain.push(`Recoverable in 2-3 clean days — the trajectory bends back`);
  } else {
    mechanismChain.push("Maintenance zone — neither gaining nor losing ground");
  }

  return {
    summary: impact.summary,
    relatableEquiv: toRelatableEquiv(scenario.totalWeeklyShift, isPositive),
    mechanismChain,
    confidence: impact.conf,
    trajectoryShift: scenario.totalWeeklyShift,
    category: "diet",
  };
};

// ── Rest Day Handler ─────────────────────────────────────────────────────────

const handleRestDay: RouteHandler = () => {
  // Compare with-exercise vs without
  const withExercise = scenarioImpact({ exercise: { type: "strength", duration: 50 } });
  const without = scenarioImpact({});

  const missedBurn = withExercise.totalWeeklyShift;

  return {
    summary:
      "Rest day — your body still burns at TDEE and recovery continues. Missing one session is a rounding error over a week of consistency.",
    relatableEquiv: `Skipping one session costs about ${toRelatableEquiv(missedBurn, true).replace(/^Worth about /, "")} of extra burn`,
    mechanismChain: [
      "TDEE still active — you're burning calories at rest",
      "Muscle recovery continues from prior sessions",
      "One rest day doesn't derail progress — consistency across the week matters more",
      "If you trained 3+ times this week, this rest is part of the plan",
    ],
    confidence: "high",
    trajectoryShift: without.totalWeeklyShift,
    category: "rest",
  };
};

// ─── Route Table ─────────────────────────────────────────────────────────────

const ROUTES: Route[] = [
  { pattern: /(\d+)\s*drink/i, handler: handleAlcohol },
  { pattern: /(\d+\.?\d*)\s*h.*sleep|sleep.*?(\d+\.?\d*)\s*h/i, handler: handleSleep },
  { pattern: /skip.*gym|no.*workout|rest.*day/i, handler: handleRestDay },
  { pattern: /gym|lift|strength|workout/i, handler: handleExerciseStrength },
  { pattern: /run|jog|cardio/i, handler: handleExerciseCardio },
  { pattern: /diet|eat|food|meal|clean|cheat/i, handler: handleDiet },
];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a natural-language "What if?" query using local keyword matching.
 * Returns a structured response if a single-factor handler matches, or null
 * if the query is too compound / ambiguous for local handling (→ Claude API).
 */
export function parseQuery(
  query: string,
  context?: { currentWeight?: number; pace?: number }
): KeywordResponse | null {
  // Compound queries should go to Claude — detect multiple factor keywords
  const factorKeywords = [
    /\bdrink/i,
    /\bsleep/i,
    /\bgym|lift|strength|workout|run|jog|cardio/i,
    /\bdiet|eat|food|meal|clean|cheat/i,
  ];
  const factorsMatched = factorKeywords.filter((re) => re.test(query)).length;
  if (factorsMatched >= 2) return null;

  for (const route of ROUTES) {
    const match = query.match(route.pattern);
    if (match) {
      return route.handler(query, match, context);
    }
  }

  return null; // No match → Claude API should handle
}
