// ─── Fitbit Web API response types ──────────────────────────────────────────
// These mirror the JSON shapes returned by Fitbit's REST API.
// Only fields we consume are typed; the API returns more.

// ─── Weight & Body Fat ───────────────────────────────────────────────────────

export interface FitbitWeightLog {
  logId: number;
  weight: number; // lbs when Accept-Language: en_US
  bmi: number;
  fat?: number; // Sometimes present on weight log itself
  date: string; // 'YYYY-MM-DD'
  time: string; // 'HH:mm:ss'
  source: string;
}

export interface FitbitWeightResponse {
  weight: FitbitWeightLog[];
}

export interface FitbitBodyFatLog {
  logId: number;
  fat: number;
  date: string; // 'YYYY-MM-DD'
  time: string; // 'HH:mm:ss'
  source: string;
}

export interface FitbitBodyFatResponse {
  fat: FitbitBodyFatLog[];
}

// ─── Sleep ───────────────────────────────────────────────────────────────────

export interface FitbitSleepStageSummary {
  deep: { count: number; minutes: number; thirtyDayAvgMinutes: number };
  light: { count: number; minutes: number; thirtyDayAvgMinutes: number };
  rem: { count: number; minutes: number; thirtyDayAvgMinutes: number };
  wake: { count: number; minutes: number; thirtyDayAvgMinutes: number };
}

export interface FitbitSleepLog {
  logId: number;
  dateOfSleep: string; // 'YYYY-MM-DD'
  duration: number; // milliseconds
  efficiency: number; // 0-100
  isMainSleep: boolean;
  levels: {
    summary: FitbitSleepStageSummary;
  };
  type: string; // 'stages' or 'classic'
}

export interface FitbitSleepResponse {
  sleep: FitbitSleepLog[];
}

// ─── Activity ────────────────────────────────────────────────────────────────

export interface FitbitActivitySummary {
  steps: number;
  caloriesOut: number;
  fairlyActiveMinutes: number;
  veryActiveMinutes: number;
  lightlyActiveMinutes: number;
  sedentaryMinutes: number;
  distances: Array<{ activity: string; distance: number }>;
}

export interface FitbitActivityResponse {
  summary: FitbitActivitySummary;
}

// ─── Heart Rate ──────────────────────────────────────────────────────────────

export interface FitbitHeartRateZone {
  name: string; // 'Out of Range', 'Fat Burn', 'Cardio', 'Peak'
  min: number;
  max: number;
  minutes: number;
  caloriesOut: number;
}

export interface FitbitHeartRateValue {
  customHeartRateZones: FitbitHeartRateZone[];
  heartRateZones: FitbitHeartRateZone[];
  restingHeartRate?: number;
}

export interface FitbitHeartRateDay {
  dateTime: string; // 'YYYY-MM-DD'
  value: FitbitHeartRateValue;
}

export interface FitbitHeartRateResponse {
  'activities-heart': FitbitHeartRateDay[];
}

// ─── HRV ─────────────────────────────────────────────────────────────────────

export interface FitbitHRVEntry {
  dateTime: string; // 'YYYY-MM-DD'
  value: {
    dailyRmssd: number;
    deepRmssd: number;
  };
}

export interface FitbitHRVResponse {
  hrv: FitbitHRVEntry[];
}
