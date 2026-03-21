// ─── Pattern Detection Engine ────────────────────────────────────────────────
// 8 behavioral pattern detectors ported from POC app.jsx (lines 258–357).
// Analyzes DayRecord[] and surfaces the top-3 nudges by priority.

import type { DayRecord } from "@/lib/db/queries";
import { ema } from "@/lib/engine";

// ─── Types ───────────────────────────────────────────────────────────────────

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
function detectWeekendAlcohol(days: DayRecord[]): Nudge | null {
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
    return {
      type: "warning",
      icon: "🍺",
      title: "Weekend pattern detected",
      body: "Most of your drinks land on weekends. This is the exact pattern that stalled Aug-Sep 2025 — weekday discipline erased by weekend recovery.",
      priority: 1,
    };
  }
  return null;
}

/** #2 — Training frequency */
function detectTrainingFrequency(days: DayRecord[]): Nudge | null {
  const last7 = days.slice(-7);
  const sessions = last7.filter((d) => d.strengthSession === true).length;

  if (sessions === 0) {
    return {
      type: "alert",
      icon: "🏋️",
      title: "No strength sessions this week",
      body: "Target is 3x/week. Strength training is the highest-leverage move for the visual recomp you want.",
      priority: 2,
    };
  }
  if (sessions < 3) {
    return {
      type: "nudge",
      icon: "🏋️",
      title: `${sessions}/3 strength sessions`,
      body: `${3 - sessions} more this week to hit target. Every session builds the lean mass that makes 200 lbs look built, not just lighter.`,
      priority: 3,
    };
  }
  return null;
}

/** #3 — Diet weekday vs weekend */
function detectDietWeekend(days: DayRecord[]): Nudge | null {
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
    return {
      type: "warning",
      icon: "🍔",
      title: "Weekend diet drop-off",
      body: `Weekday average: ${wkdayAvg.toFixed(1)} (solid). Weekend average: ${wkendAvg.toFixed(1)} (undoing it). One Friday decision sets the weekend tone.`,
      priority: 2,
    };
  }
  return null;
}

/** #4 — Sleep trend */
function detectSleepTrend(days: DayRecord[]): Nudge | null {
  const sleepDays = days
    .filter((d) => d.sleepTotalHours != null)
    .slice(-7);
  if (sleepDays.length < 3) return null;

  const avg =
    sleepDays.reduce((a, d) => a + d.sleepTotalHours!, 0) / sleepDays.length;
  const subSeven = sleepDays.filter((d) => d.sleepTotalHours! < 7).length;

  if (avg < 7) {
    return {
      type: "warning",
      icon: "😴",
      title: `Sleep averaging ${avg.toFixed(1)}h`,
      body: "Under 7h means weight loss shifts from 56% fat to ~35% fat. You're losing the same weight but more of it is muscle.",
      priority: 2,
    };
  }
  if (subSeven >= 2) {
    return {
      type: "nudge",
      icon: "😴",
      title: `${subSeven} nights under 7h this week`,
      body: "Mostly good, but those short nights spike hunger hormones the next day. The cascade compounds.",
      priority: 4,
    };
  }
  return null;
}

/** #5 — Weight trend */
function detectWeightTrend(days: DayRecord[]): Nudge | null {
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
    return {
      type: "positive",
      icon: "🔥",
      title: "Pace ahead of target",
      body: `Trending ~${rate.toFixed(1)} lbs/week — faster than the 0.5 target. If this feels sustainable, ride it. If you're grinding, ease up slightly.`,
      priority: 3,
    };
  }
  if (rate > 0.3) {
    return {
      type: "positive",
      icon: "📈",
      title: "On pace",
      body: `Trending ~${rate.toFixed(1)} lbs/week. This is the sustainable rate that worked Oct-Nov 2025. Keep doing exactly what you're doing.`,
      priority: 5,
    };
  }
  if (rate < 0.1 && daySpan >= 1.5) {
    return {
      type: "alert",
      icon: "📊",
      title: "Trend is flat",
      body:
        "Weight hasn't moved meaningfully in ~" +
        Math.round(daySpan) +
        " weeks. Check if something changed — the Aug-Sep 2025 plateau looked like this.",
      priority: 1,
    };
  }
  return null;
}

/** #6 — Logging streak */
function detectLoggingStreak(days: DayRecord[]): Nudge | null {
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
    return {
      type: "alert",
      icon: "📵",
      title: `${unloggedStreak} days with no logs`,
      body: "Logging gaps are the #1 risk. The 8-month gap in 2024-25 is where 12 lbs came from. 30 seconds a day keeps the trajectory visible.",
      priority: 0,
    };
  }
  if (loggedDays >= 12) {
    return {
      type: "positive",
      icon: "🔗",
      title: `${loggedDays}/14 days logged`,
      body: "Consistency is the foundation everything else is built on. This is exactly the pattern that drives results.",
      priority: 5,
    };
  }
  return null;
}

/** #7 — Dry streak */
function detectDryStreak(days: DayRecord[]): Nudge | null {
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
    return {
      type: "positive",
      icon: "✨",
      title: `${streak}-day dry streak`,
      body: "This is the move. Oct-Nov 2025 proved it — dry streaks are the single highest-leverage pattern in your data.",
      priority: 2,
    };
  }
  return null;
}

/** #8 — Plateau detection via EMA smoothing */
function detectPlateau(days: DayRecord[]): Nudge | null {
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
    return {
      type: "warning",
      icon: "📊",
      title: "Possible plateau",
      body: `Weight has stayed within ${range.toFixed(1)} lbs over the last ${Math.round(daysBetween)} days. The Aug-Sep 2025 plateau looked exactly like this. Check what changed — usually it's weekend patterns compounding.`,
      priority: 1,
    };
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run all 8 pattern detectors against the given day records.
 * Returns the top 3 nudges sorted by priority (lowest = most urgent).
 */
export function detectAll(days: DayRecord[]): Nudge[] {
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
    const result = detect(days);
    if (result) nudges.push(result);
  }

  return nudges.sort((a, b) => a.priority - b.priority).slice(0, 3);
}
