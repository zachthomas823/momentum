// ─── Pattern Detection Engine ────────────────────────────────────────────────
// 8 behavioral pattern detectors ported from POC app.jsx (lines 258–357).
// Analyzes DayRecord[] and surfaces the top-3 nudges by priority.

import type { DayRecord } from "@/lib/db/queries";
import { ema } from "@/lib/engine";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Persona = 'coach' | 'buddy' | 'analyst';

export interface Nudge {
  type: "alert" | "warning" | "nudge" | "positive";
  icon: string;
  title: string;
  body: string;
  priority: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Day-of-week from a YYYY-MM-DD date string (0=Sun … 6=Sat). */
function dow(date: string): number {
  return new Date(date + "T12:00:00").getDay();
}

/** Whether a DayRecord has any logged data at all. */
function isLogged(d: DayRecord): boolean {
  return (
    d.dietScore != null ||
    d.totalDrinks != null ||
    d.dry != null ||
    d.weightLbs != null ||
    d.sleepTotalHours != null ||
    d.strengthSession != null
  );
}

/** Whether a DayRecord counts as a dry day. */
function isDryDay(d: DayRecord): boolean {
  return d.dry === true || (d.totalDrinks != null && d.totalDrinks === 0);
}

// ─── Detectors ───────────────────────────────────────────────────────────────

/** #1 — Weekend alcohol pattern */
function detectWeekendAlcohol(days: DayRecord[], persona: Persona): Nudge | null {
  const byDow: Record<number, number[]> = {};
  for (const d of days) {
    const day = dow(d.date);
    if (!byDow[day]) byDow[day] = [];
    if (d.totalDrinks != null && d.totalDrinks > 0) {
      byDow[day].push(d.totalDrinks);
    }
  }

  const wkendDrinks = [
    ...(byDow[5] ?? []),
    ...(byDow[6] ?? []),
    ...(byDow[0] ?? []),
  ];
  const wkdayDrinks = [1, 2, 3, 4].flatMap((d) => byDow[d] ?? []);

  const wkendTotal = wkendDrinks.reduce((a, b) => a + b, 0);
  const wkdayTotal = wkdayDrinks.reduce((a, b) => a + b, 0);

  if (wkendDrinks.length > 0 && wkendTotal > wkdayTotal * 1.5) {
    const body = {
      coach: "Most of your drinks land on weekends. This pattern erases weekday discipline — weekend recovery undoes real progress.",
      buddy: "Weekends are where most of the drinks pile up. Totally normal pattern, but worth watching so it doesn't sneak up on you.",
      analyst: `Weekend alcohol: ${wkendTotal} drinks vs ${wkdayTotal} weekday. Ratio exceeds 1.5x threshold — this pattern correlates with stalled progress.`,
    }[persona];
    return {
      type: "warning",
      icon: "🍺",
      title: "Weekend pattern detected",
      body,
      priority: 1,
    };
  }
  return null;
}

/** #2 — Training frequency */
function detectTrainingFrequency(days: DayRecord[], persona: Persona): Nudge | null {
  const last7 = days.slice(-7);
  const sessions = last7.filter((d) => d.strengthSession === true).length;

  if (sessions === 0) {
    const body = {
      coach: "Target is 3x/week. Strength training is the highest-leverage move for the visual recomp you want.",
      buddy: "No gym sessions this week — happens to everyone. Even one session is better than zero if you can squeeze it in.",
      analyst: "0/3 target strength sessions completed. Strength training has the highest impact coefficient for body recomposition.",
    }[persona];
    return {
      type: "alert",
      icon: "🏋️",
      title: "No strength sessions this week",
      body,
      priority: 2,
    };
  }
  if (sessions < 3) {
    const remaining = 3 - sessions;
    const body = {
      coach: `${remaining} more this week to hit target. Every session builds the lean mass that makes the scale number look built, not just lighter.`,
      buddy: `${sessions} down, ${remaining} to go — you're on your way. Each session counts more than you think.`,
      analyst: `${sessions}/3 sessions completed. ${remaining} remaining to meet weekly target. Each session contributes ~0.1 lb lean mass retention per week.`,
    }[persona];
    return {
      type: "nudge",
      icon: "🏋️",
      title: `${sessions}/3 strength sessions`,
      body,
      priority: 3,
    };
  }
  return null;
}

/** #3 — Diet weekday vs weekend */
function detectDietWeekend(days: DayRecord[], persona: Persona): Nudge | null {
  const dietDays = days.filter((d) => d.dietScore != null);
  if (dietDays.length < 5) return null;

  const wkdayDiet = dietDays.filter((d) => {
    const day = dow(d.date);
    return day >= 1 && day <= 5;
  });
  const wkendDiet = dietDays.filter((d) => {
    const day = dow(d.date);
    return day === 0 || day === 6;
  });

  const wkdayAvg = wkdayDiet.length
    ? wkdayDiet.reduce((a, d) => a + d.dietScore!, 0) / wkdayDiet.length
    : 0;
  const wkendAvg = wkendDiet.length
    ? wkendDiet.reduce((a, d) => a + d.dietScore!, 0) / wkendDiet.length
    : 0;

  if (wkdayAvg >= 3.5 && wkendAvg < 2.5 && wkendDiet.length >= 1) {
    const body = {
      coach: `Weekday average: ${wkdayAvg.toFixed(1)} (solid). Weekend average: ${wkendAvg.toFixed(1)} (undoing it). One Friday decision sets the weekend tone.`,
      buddy: `Weekdays are going great at ${wkdayAvg.toFixed(1)} — weekends dip to ${wkendAvg.toFixed(1)} though. A small Friday night plan can change the whole weekend.`,
      analyst: `Weekday diet score: ${wkdayAvg.toFixed(1)}. Weekend diet score: ${wkendAvg.toFixed(1)}. Delta of ${(wkdayAvg - wkendAvg).toFixed(1)} exceeds threshold.`,
    }[persona];
    return {
      type: "warning",
      icon: "🍔",
      title: "Weekend diet drop-off",
      body,
      priority: 2,
    };
  }
  return null;
}

/** #4 — Sleep trend */
function detectSleepTrend(days: DayRecord[], persona: Persona): Nudge | null {
  const sleepDays = days
    .filter((d) => d.sleepTotalHours != null)
    .slice(-7);
  if (sleepDays.length < 3) return null;

  const avg =
    sleepDays.reduce((a, d) => a + d.sleepTotalHours!, 0) / sleepDays.length;
  const subSeven = sleepDays.filter((d) => d.sleepTotalHours! < 7).length;

  if (avg < 7) {
    const body = {
      coach: "Under 7h means weight loss shifts from 56% fat to ~35% fat. You're losing the same weight but more of it is muscle.",
      buddy: `Averaging ${avg.toFixed(1)}h — your body needs more rest to lose fat effectively. Even 30 min earlier makes a difference.`,
      analyst: `Mean sleep: ${avg.toFixed(1)}h. Below 7h threshold, fat-loss ratio drops from ~56% to ~35%. Net muscle loss increases proportionally.`,
    }[persona];
    return {
      type: "warning",
      icon: "😴",
      title: `Sleep averaging ${avg.toFixed(1)}h`,
      body,
      priority: 2,
    };
  }
  if (subSeven >= 2) {
    const body = {
      coach: "Mostly good, but those short nights spike hunger hormones the next day. The cascade compounds.",
      buddy: `${subSeven} rough nights this week — not bad overall. Watch for extra cravings the day after, that's where sleep debt sneaks in.`,
      analyst: `${subSeven}/7 nights below 7h. Ghrelin elevation on following days increases caloric intake risk by ~15%.`,
    }[persona];
    return {
      type: "nudge",
      icon: "😴",
      title: `${subSeven} nights under 7h this week`,
      body,
      priority: 4,
    };
  }
  return null;
}

/** #5 — Weight trend */
function detectWeightTrend(days: DayRecord[], persona: Persona): Nudge | null {
  const weightDays = days
    .filter((d) => d.weightLbs != null)
    .slice(-14);
  if (weightDays.length < 3) return null;

  const first =
    weightDays.slice(0, 3).reduce((a, d) => a + d.weightLbs!, 0) / 3;
  const last =
    weightDays.slice(-3).reduce((a, d) => a + d.weightLbs!, 0) / 3;

  const daySpan =
    (new Date(weightDays[weightDays.length - 1].date).getTime() -
      new Date(weightDays[0].date).getTime()) /
    (7 * 864e5);
  const rate = daySpan > 0 ? (first - last) / daySpan : 0;

  if (rate > 0.7) {
    const body = {
      coach: `Trending ~${rate.toFixed(1)} lbs/week — faster than the 0.5 target. If this feels sustainable, ride it. If you're grinding, ease up slightly.`,
      buddy: `Down ~${rate.toFixed(1)} lbs/week — that's moving fast! Make sure you're not white-knuckling it, sustainable wins beat sprint-and-crash.`,
      analyst: `Rate: ${rate.toFixed(1)} lbs/week, exceeding 0.5 lb target by ${((rate - 0.5) * 100 / 0.5).toFixed(0)}%. Monitor for lean mass loss at this pace.`,
    }[persona];
    return {
      type: "positive",
      icon: "🔥",
      title: "Pace ahead of target",
      body,
      priority: 3,
    };
  }
  if (rate > 0.3) {
    const body = {
      coach: `Trending ~${rate.toFixed(1)} lbs/week. This is the sustainable rate that drives real results. Keep doing exactly what you're doing.`,
      buddy: `~${rate.toFixed(1)} lbs/week — right in the sweet spot. Whatever you're doing is working, keep it rolling.`,
      analyst: `Rate: ${rate.toFixed(1)} lbs/week. Within optimal 0.3–0.7 lb/week range for lean mass preservation.`,
    }[persona];
    return {
      type: "positive",
      icon: "📈",
      title: "On pace",
      body,
      priority: 5,
    };
  }
  if (rate < 0.1 && daySpan >= 1.5) {
    const weeks = Math.round(daySpan);
    const body = {
      coach: `Weight hasn't moved meaningfully in ~${weeks} weeks. Check what changed — usually it's weekend patterns compounding.`,
      buddy: `Flat for about ${weeks} weeks — don't sweat it, plateaus happen. Worth checking if anything shifted in routine though.`,
      analyst: `Trend flat for ~${weeks} weeks (rate: ${rate.toFixed(2)} lbs/week). Statistically indistinguishable from zero. Investigate variables.`,
    }[persona];
    return {
      type: "alert",
      icon: "📊",
      title: "Trend is flat",
      body,
      priority: 1,
    };
  }
  return null;
}

/** #6 — Logging streak */
function detectLoggingStreak(days: DayRecord[], persona: Persona): Nudge | null {
  const last14 = days.slice(-14);
  const last7 = days.slice(-7);
  const loggedDays = last14.filter(isLogged).length;

  // Count unlogged streak from most recent day backwards
  let unloggedStreak = 0;
  for (let i = last7.length - 1; i >= 0; i--) {
    if (!isLogged(last7[i])) unloggedStreak++;
    else break;
  }

  if (unloggedStreak >= 3) {
    const body = {
      coach: "Logging gaps are the #1 risk. Gaps are where progress disappears. 30 seconds a day keeps the trajectory visible.",
      buddy: `${unloggedStreak} days without logging — life gets busy. Even a quick partial log keeps the habit alive.`,
      analyst: `${unloggedStreak}-day logging gap detected. Historical data shows logging gaps >3 days correlate with weight regain. Resume tracking to maintain data continuity.`,
    }[persona];
    return {
      type: "alert",
      icon: "📵",
      title: `${unloggedStreak} days with no logs`,
      body,
      priority: 0,
    };
  }
  if (loggedDays >= 12) {
    const body = {
      coach: "Consistency is the foundation everything else is built on. This is exactly the pattern that drives results.",
      buddy: `${loggedDays} out of 14 days logged — you're crushing the consistency game. That's the real secret sauce.`,
      analyst: `${loggedDays}/14 days logged (${((loggedDays / 14) * 100).toFixed(0)}% adherence). Above 85% threshold for reliable trend analysis.`,
    }[persona];
    return {
      type: "positive",
      icon: "🔗",
      title: `${loggedDays}/14 days logged`,
      body,
      priority: 5,
    };
  }
  return null;
}

/** #7 — Dry streak */
function detectDryStreak(days: DayRecord[], persona: Persona): Nudge | null {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (isDryDay(d)) {
      streak++;
    } else if (d.totalDrinks != null && d.totalDrinks > 0) {
      break;
    }
    // d.dry === null && d.totalDrinks == null → skip (no alcohol data logged)
  }

  if (streak >= 5) {
    const body = {
      coach: "This is the move. Dry streaks are the single highest-leverage pattern in the data. Keep it going.",
      buddy: `${streak} days dry — that's awesome! This is one of the most impactful things you can do. The momentum is real.`,
      analyst: `${streak}-day dry streak. Dry streaks show the strongest correlation with weekly weight loss rate in historical data.`,
    }[persona];
    return {
      type: "positive",
      icon: "✨",
      title: `${streak}-day dry streak`,
      body,
      priority: 2,
    };
  }
  return null;
}

/** #8 — Plateau detection via EMA smoothing */
function detectPlateau(days: DayRecord[], persona: Persona): Nudge | null {
  const wAll = days.filter((d) => d.weightLbs != null);
  if (wAll.length < 4) return null;

  const smoothed = ema(wAll.map((d) => d.weightLbs!));
  const recent = smoothed.slice(-4);
  const range = Math.max(...recent) - Math.min(...recent);

  const daysBetween =
    (new Date(wAll[wAll.length - 1].date).getTime() -
      new Date(wAll[Math.max(0, wAll.length - 4)].date).getTime()) /
    864e5;

  if (range < 1.0 && daysBetween >= 7) {
    const roundedDays = Math.round(daysBetween);
    const body = {
      coach: `Weight has stayed within ${range.toFixed(1)} lbs over the last ${roundedDays} days. Check what changed — usually it's weekend patterns compounding.`,
      buddy: `Weight's been flat (within ${range.toFixed(1)} lbs) for about ${roundedDays} days. Plateaus are normal — might be time to shake something up.`,
      analyst: `EMA range: ${range.toFixed(1)} lbs over ${roundedDays} days. Below 1.0 lb variance threshold. Plateau probability: high. Review caloric variables.`,
    }[persona];
    return {
      type: "warning",
      icon: "📊",
      title: "Possible plateau",
      body,
      priority: 1,
    };
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run all 8 pattern detectors against the given day records.
 * Returns the top 3 nudges sorted by priority (lowest = most urgent).
 * @param days — array of day records to analyze
 * @param persona — persona for body copy tone (defaults to 'coach')
 */
export function detectAll(days: DayRecord[], persona: Persona = 'coach'): Nudge[] {
  if (!days || days.length < 3) return [];

  const nudges: Nudge[] = [];

  const detectors = [
    detectWeekendAlcohol,
    detectTrainingFrequency,
    detectDietWeekend,
    detectSleepTrend,
    detectWeightTrend,
    detectLoggingStreak,
    detectDryStreak,
    detectPlateau,
  ];

  for (const detect of detectors) {
    const result = detect(days, persona);
    if (result) nudges.push(result);
  }

  return nudges.sort((a, b) => a.priority - b.priority).slice(0, 3);
}
