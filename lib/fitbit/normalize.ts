// ─── Pure normalization functions ────────────────────────────────────────────
// Each function transforms Fitbit API shapes → Drizzle insert shapes.
// No side effects, no DB calls, no fetch — fully testable.

import type {
  FitbitWeightLog,
  FitbitBodyFatLog,
  FitbitSleepLog,
  FitbitActivitySummary,
  FitbitActivityEntry,
  FitbitHeartRateValue,
  FitbitHRVEntry,
} from './types';

// ─── Types matching Drizzle insert shapes ────────────────────────────────────

export interface WeightLogInsert {
  date: string;
  weightLbs: number | null;
  bodyFatPct: number | null;
  bmi: number | null;
  source: string;
  fitbitLogId: number | null;
  loggedAt: Date | null;
}

export interface SleepLogInsert {
  date: string;
  totalHours: number | null;
  deepMin: number | null;
  lightMin: number | null;
  remMin: number | null;
  wakeMin: number | null;
  efficiency: number | null;
  source: string;
  fitbitLogId: number | null;
  loggedAt: Date | null;
}

export interface ActivityLogInsert {
  date: string;
  steps: number | null;
  caloriesOut: number | null;
  activeMinutes: number | null;
  strengthSession: boolean | null;
  strengthDuration: number | null;
  run: boolean | null;
  runDuration: number | null;
  walk: boolean | null;
  source: string;
}

export interface HeartRateLogInsert {
  date: string;
  restingHr: number | null;
  hrvRmssd: number | null;
  zonesJson: unknown;
  source: string;
}

// ─── Weight Logs ─────────────────────────────────────────────────────────────

/**
 * Normalize Fitbit weight logs into DB insert shapes.
 * Merges body fat from the dedicated Body Fat Log endpoint when the weight log's
 * own `fat` field is null — keyed by date.
 */
export function normalizeWeightLogs(
  weightLogs: FitbitWeightLog[],
  bodyFatLogs?: FitbitBodyFatLog[]
): WeightLogInsert[] {
  // Build a date → body fat lookup from the dedicated endpoint
  const bfByDate = new Map<string, number>();
  if (bodyFatLogs) {
    for (const bf of bodyFatLogs) {
      // If multiple entries per day, keep the latest (last in array)
      bfByDate.set(bf.date, bf.fat);
    }
  }

  return weightLogs.map((w) => ({
    date: w.date,
    weightLbs: w.weight,
    bodyFatPct: w.fat ?? bfByDate.get(w.date) ?? null,
    bmi: w.bmi,
    source: 'fitbit',
    fitbitLogId: w.logId,
    loggedAt: new Date(`${w.date}T${w.time}`),
  }));
}

// ─── Sleep Logs ──────────────────────────────────────────────────────────────

/**
 * Normalize Fitbit sleep logs. Only processes main sleep entries (isMainSleep).
 * Converts duration from milliseconds to hours.
 * Handles both 'stages' and 'classic' sleep types — classic has no stage breakdown.
 */
export function normalizeSleepLogs(sleepLogs: FitbitSleepLog[]): SleepLogInsert[] {
  // Only keep main sleep entries (skip naps)
  const mainSleeps = sleepLogs.filter((s) => s.isMainSleep);

  return mainSleeps.map((s) => {
    const isStages = s.type === 'stages' && s.levels?.summary;
    return {
      date: s.dateOfSleep,
      totalHours: Math.round((s.duration / 3_600_000) * 100) / 100, // ms → hours, 2 decimal places
      deepMin: isStages ? s.levels.summary.deep.minutes : null,
      lightMin: isStages ? s.levels.summary.light.minutes : null,
      remMin: isStages ? s.levels.summary.rem.minutes : null,
      wakeMin: isStages ? s.levels.summary.wake.minutes : null,
      efficiency: s.efficiency,
      source: 'fitbit',
      fitbitLogId: s.logId,
      loggedAt: new Date(`${s.dateOfSleep}T00:00:00`),
    };
  });
}

// ─── Exercise Classification ─────────────────────────────────────────────────

/** Keywords that identify strength/weight training exercises from Fitbit activity names. */
const STRENGTH_KEYWORDS = [
  'weight', 'weights', 'strength', 'resistance', 'lifting', 'gym',
  'workout', 'crossfit', 'circuit', 'kettlebell', 'dumbbell', 'barbell',
  'hiit', 'bodyweight', 'calisthenics', 'pilates', 'bootcamp',
];

const RUN_KEYWORDS = ['run', 'running', 'jog', 'jogging', 'treadmill', 'sprint'];
const WALK_KEYWORDS = ['walk', 'walking', 'hike', 'hiking'];

function nameMatchesAny(name: string, keywords: string[]): boolean {
  const lower = name.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * Classify Fitbit exercise entries into strength/run/walk categories.
 * Returns booleans and durations for each category.
 */
function classifyExercises(activities: FitbitActivityEntry[]): {
  strengthSession: boolean;
  strengthDuration: number | null;
  run: boolean;
  runDuration: number | null;
  walk: boolean;
} {
  let strengthSession = false;
  let strengthDuration: number | null = null;
  let run = false;
  let runDuration: number | null = null;
  let walk = false;

  for (const act of activities) {
    const durationMin = Math.round(act.duration / 60_000);

    if (nameMatchesAny(act.name, STRENGTH_KEYWORDS) || nameMatchesAny(act.activityParentName, STRENGTH_KEYWORDS)) {
      strengthSession = true;
      strengthDuration = (strengthDuration ?? 0) + durationMin;
    } else if (nameMatchesAny(act.name, RUN_KEYWORDS) || nameMatchesAny(act.activityParentName, RUN_KEYWORDS)) {
      run = true;
      runDuration = (runDuration ?? 0) + durationMin;
    } else if (nameMatchesAny(act.name, WALK_KEYWORDS) || nameMatchesAny(act.activityParentName, WALK_KEYWORDS)) {
      walk = true;
    }
  }

  return { strengthSession, strengthDuration, run, runDuration, walk };
}

// ─── Activity Logs ───────────────────────────────────────────────────────────

/**
 * Normalize a single day's Fitbit activity summary + exercise entries.
 * active_minutes = fairlyActiveMinutes + veryActiveMinutes.
 * Exercise classification derived from the activities array (logged/tracked/auto-detected exercises).
 */
export function normalizeActivityLog(
  date: string,
  summary: FitbitActivitySummary,
  activities: FitbitActivityEntry[] = []
): ActivityLogInsert {
  const classified = classifyExercises(activities);
  return {
    date,
    steps: summary.steps,
    caloriesOut: summary.caloriesOut,
    activeMinutes: summary.fairlyActiveMinutes + summary.veryActiveMinutes,
    strengthSession: classified.strengthSession,
    strengthDuration: classified.strengthDuration,
    run: classified.run,
    runDuration: classified.runDuration,
    walk: classified.walk,
    source: 'fitbit',
  };
}

// ─── Heart Rate Logs ─────────────────────────────────────────────────────────

/**
 * Normalize a day's heart rate data plus optional HRV data.
 * Stores zones as JSON, resting HR as scalar, HRV rmssd as scalar.
 */
export function normalizeHeartRateLog(
  date: string,
  hrValue: FitbitHeartRateValue,
  hrvEntry?: FitbitHRVEntry
): HeartRateLogInsert {
  return {
    date,
    restingHr: hrValue.restingHeartRate ?? null,
    hrvRmssd: hrvEntry?.value?.dailyRmssd ?? null,
    zonesJson: hrValue.heartRateZones,
    source: 'fitbit',
  };
}
