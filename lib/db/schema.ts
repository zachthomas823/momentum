import {
  pgTable,
  serial,
  date,
  real,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  bigint,
  unique,
} from 'drizzle-orm/pg-core';

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// ─── Weight Logs ─────────────────────────────────────────────────────────────
export const weightLogs = pgTable(
  'weight_logs',
  {
    id: serial('id').primaryKey(),
    date: date('date').notNull(),
    weightLbs: real('weight_lbs'),
    bodyFatPct: real('body_fat_pct'),
    bmi: real('bmi'),
    source: text('source').default('fitbit'),
    fitbitLogId: bigint('fitbit_log_id', { mode: 'number' }),
    loggedAt: timestamp('logged_at'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [unique('weight_logs_date_source_unique').on(t.date, t.source)]
);

// ─── Sleep Logs ──────────────────────────────────────────────────────────────
export const sleepLogs = pgTable(
  'sleep_logs',
  {
    id: serial('id').primaryKey(),
    date: date('date').notNull(),
    totalHours: real('total_hours'),
    deepMin: integer('deep_min'),
    lightMin: integer('light_min'),
    remMin: integer('rem_min'),
    wakeMin: integer('wake_min'),
    efficiency: integer('efficiency'),
    source: text('source').default('fitbit'),
    fitbitLogId: bigint('fitbit_log_id', { mode: 'number' }),
    loggedAt: timestamp('logged_at'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [unique('sleep_logs_date_source_unique').on(t.date, t.source)]
);

// ─── Activity Logs ───────────────────────────────────────────────────────────
export const activityLogs = pgTable(
  'activity_logs',
  {
    id: serial('id').primaryKey(),
    date: date('date').notNull(),
    steps: integer('steps'),
    caloriesOut: integer('calories_out'),
    activeMinutes: integer('active_minutes'),
    strengthSession: boolean('strength_session').default(false),
    strengthDuration: integer('strength_duration'),
    run: boolean('run').default(false),
    runDuration: integer('run_duration'),
    walk: boolean('walk').default(false),
    source: text('source').default('fitbit'),
    fitbitLogId: bigint('fitbit_log_id', { mode: 'number' }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [unique('activity_logs_date_source_unique').on(t.date, t.source)]
);

// ─── Heart Rate Logs ─────────────────────────────────────────────────────────
export const heartRateLogs = pgTable(
  'heart_rate_logs',
  {
    id: serial('id').primaryKey(),
    date: date('date').notNull(),
    restingHr: integer('resting_hr'),
    hrvRmssd: real('hrv_rmssd'),
    zonesJson: jsonb('zones_json'),
    source: text('source').default('fitbit'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [unique('heart_rate_logs_date_source_unique').on(t.date, t.source)]
);

// ─── Diet Logs ───────────────────────────────────────────────────────────────
export const dietLogs = pgTable(
  'diet_logs',
  {
    id: serial('id').primaryKey(),
    date: date('date').notNull().unique(),
    mode: text('mode').notNull(), // 'vibes' or 'meals'
    score: integer('score').notNull(), // 1-5
    mealsJson: jsonb('meals_json'),
    createdAt: timestamp('created_at').defaultNow(),
  }
);

// ─── Alcohol Logs ────────────────────────────────────────────────────────────
export const alcoholLogs = pgTable(
  'alcohol_logs',
  {
    id: serial('id').primaryKey(),
    date: date('date').notNull().unique(),
    totalDrinks: integer('total_drinks').notNull(),
    sessionsJson: jsonb('sessions_json'),
    dry: boolean('dry').default(false),
    createdAt: timestamp('created_at').defaultNow(),
  }
);

// ─── Fitbit Tokens ───────────────────────────────────────────────────────────
export const fitbitTokens = pgTable('fitbit_tokens', {
  id: serial('id').primaryKey(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  scopes: text('scopes'),
  userId: text('user_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── Sync History ────────────────────────────────────────────────────────────
export const syncHistory = pgTable('sync_history', {
  id: serial('id').primaryKey(),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  recordsSynced: integer('records_synced').default(0),
  error: text('error'),
});

// ─── Scenarios (S04) ─────────────────────────────────────────────────────────
export const scenarios = pgTable('scenarios', {
  id: serial('id').primaryKey(),
  query: text('query').notNull(),
  responseJson: jsonb('response_json').notNull(),
  cascadeJson: jsonb('cascade_json'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ─── Config ──────────────────────────────────────────────────────────────────
export const config = pgTable('config', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  valueJson: jsonb('value_json'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── Progress Photos ─────────────────────────────────────────────────────────
export const photos = pgTable('photos', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  type: text('type').notNull(),            // 'front' | 'side'
  blobUrl: text('blob_url').notNull(),
  blobPathname: text('blob_pathname'),
  weightLbs: real('weight_lbs'),
  bodyFatPct: real('body_fat_pct'),
  analysisJson: jsonb('analysis_json'),
  createdAt: timestamp('created_at').defaultNow(),
});
