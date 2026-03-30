// ─── Query layer for downstream slices ──────────────────────────────────────
// Provides getDayRecords, getLatestWeight, getLast14Days, and upsert functions.
// All dates are YYYY-MM-DD strings. DayRecord fields are nullable (a day may
// have weight data but no sleep, etc.).

import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  weightLogs,
  sleepLogs,
  activityLogs,
  heartRateLogs,
  dietLogs,
  alcoholLogs,
  vacationLogs,
  scenarios,
  photos,
  userProfile,
  milestones,
} from '@/lib/db/schema';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DayRecord {
  date: string;
  // Weight
  weightLbs: number | null;
  bodyFatPct: number | null;
  bmi: number | null;
  // Sleep
  sleepTotalHours: number | null;
  sleepDeepMin: number | null;
  sleepLightMin: number | null;
  sleepRemMin: number | null;
  sleepWakeMin: number | null;
  sleepEfficiency: number | null;
  // Activity
  steps: number | null;
  caloriesOut: number | null;
  activeMinutes: number | null;
  strengthSession: boolean | null;
  run: boolean | null;
  walk: boolean | null;
  // Heart rate
  restingHr: number | null;
  hrvRmssd: number | null;
  // Diet
  dietScore: number | null;
  dietMode: string | null;
  // Alcohol
  totalDrinks: number | null;
  dry: boolean | null;
  // Vacation
  vacationName: string | null;
  vacationNotes: string | null;
}

// ─── getDayRecords ───────────────────────────────────────────────────────────

/**
 * Fetch joined health data for a date range (inclusive).
 * Each unique date produces one DayRecord with nullable fields from all 6 tables.
 */
export async function getDayRecords(
  startDate: string,
  endDate: string
): Promise<DayRecord[]> {
  const db = getDb();

  // We gather all unique dates from all tables, then left-join each table's data.
  // Using a raw SQL approach via Drizzle for the cross-table join.
  const result = await db.execute<{
    date: string;
    weight_lbs: number | null;
    body_fat_pct: number | null;
    bmi: number | null;
    total_hours: number | null;
    deep_min: number | null;
    light_min: number | null;
    rem_min: number | null;
    wake_min: number | null;
    efficiency: number | null;
    steps: number | null;
    calories_out: number | null;
    active_minutes: number | null;
    strength_session: boolean | null;
    run: boolean | null;
    walk: boolean | null;
    resting_hr: number | null;
    hrv_rmssd: number | null;
    diet_score: number | null;
    diet_mode: string | null;
    total_drinks: number | null;
    dry: boolean | null;
    vacation_name: string | null;
    vacation_notes: string | null;
  }>(sql`
    WITH all_dates AS (
      SELECT DISTINCT date FROM (
        SELECT date FROM weight_logs WHERE date >= ${startDate} AND date <= ${endDate}
        UNION
        SELECT date FROM sleep_logs WHERE date >= ${startDate} AND date <= ${endDate}
        UNION
        SELECT date FROM activity_logs WHERE date >= ${startDate} AND date <= ${endDate}
        UNION
        SELECT date FROM heart_rate_logs WHERE date >= ${startDate} AND date <= ${endDate}
        UNION
        SELECT date FROM diet_logs WHERE date >= ${startDate} AND date <= ${endDate}
        UNION
        SELECT date FROM alcohol_logs WHERE date >= ${startDate} AND date <= ${endDate}
        UNION
        SELECT date FROM vacation_logs WHERE date >= ${startDate} AND date <= ${endDate}
      ) AS dates
    )
    SELECT
      d.date::text AS date,
      w.weight_lbs,
      w.body_fat_pct,
      w.bmi,
      s.total_hours,
      s.deep_min,
      s.light_min,
      s.rem_min,
      s.wake_min,
      s.efficiency,
      a.steps,
      a.calories_out,
      a.active_minutes,
      COALESCE(am.strength_session, a.strength_session) AS strength_session,
      COALESCE(am.run, a.run) AS run,
      COALESCE(am.walk, a.walk) AS walk,
      h.resting_hr,
      h.hrv_rmssd,
      dl.score AS diet_score,
      dl.mode AS diet_mode,
      al.total_drinks,
      al.dry,
      vl.vacation_name,
      vl.notes AS vacation_notes
    FROM all_dates d
    LEFT JOIN weight_logs w ON w.date = d.date AND w.source = 'fitbit'
    LEFT JOIN sleep_logs s ON s.date = d.date AND s.source = 'fitbit'
    LEFT JOIN activity_logs a ON a.date = d.date AND a.source = 'fitbit'
    LEFT JOIN activity_logs am ON am.date = d.date AND am.source = 'manual'
    LEFT JOIN heart_rate_logs h ON h.date = d.date AND h.source = 'fitbit'
    LEFT JOIN diet_logs dl ON dl.date = d.date
    LEFT JOIN alcohol_logs al ON al.date = d.date
    LEFT JOIN vacation_logs vl ON vl.date = d.date
    ORDER BY d.date ASC
  `);

  return result.rows.map((r) => ({
    date: r.date,
    weightLbs: r.weight_lbs,
    bodyFatPct: r.body_fat_pct,
    bmi: r.bmi,
    sleepTotalHours: r.total_hours,
    sleepDeepMin: r.deep_min,
    sleepLightMin: r.light_min,
    sleepRemMin: r.rem_min,
    sleepWakeMin: r.wake_min,
    sleepEfficiency: r.efficiency,
    steps: r.steps,
    caloriesOut: r.calories_out,
    activeMinutes: r.active_minutes,
    strengthSession: r.strength_session,
    run: r.run,
    walk: r.walk,
    restingHr: r.resting_hr,
    hrvRmssd: r.hrv_rmssd,
    dietScore: r.diet_score,
    dietMode: r.diet_mode,
    totalDrinks: r.total_drinks,
    dry: r.dry,
    vacationName: r.vacation_name,
    vacationNotes: r.vacation_notes,
  }));
}

// ─── getLatestWeight ─────────────────────────────────────────────────────────

/**
 * Returns the most recent weight_logs entry, or null if none exist.
 */
export async function getLatestWeight() {
  const db = getDb();
  const rows = await db
    .select()
    .from(weightLogs)
    .orderBy(desc(weightLogs.date))
    .limit(1);
  return rows[0] ?? null;
}

// ─── getLast14Days ────────────────────────────────────────────────────────────

/**
 * Format a Date as YYYY-MM-DD using local timezone (not UTC).
 * Fixes the toISOString() bug where dates shift after 5pm Pacific.
 */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Convenience wrapper: returns getDayRecords for the last 14 days from today.
 * Used by S04 for Claude API context assembly.
 */
export async function getLast14Days(): Promise<DayRecord[]> {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 13); // 14 days inclusive of today

  return getDayRecords(localDateStr(start), localDateStr(today));
}

// ─── Upsert functions ────────────────────────────────────────────────────────

/**
 * Upsert a weight log entry. Conflict resolution on (date, source).
 */
export async function upsertWeightLog(data: typeof weightLogs.$inferInsert) {
  const db = getDb();
  await db
    .insert(weightLogs)
    .values(data)
    .onConflictDoUpdate({
      target: [weightLogs.date, weightLogs.source],
      set: {
        weightLbs: data.weightLbs,
        bodyFatPct: data.bodyFatPct,
        bmi: data.bmi,
        fitbitLogId: data.fitbitLogId,
        loggedAt: data.loggedAt,
      },
    });
}

/**
 * Upsert a sleep log entry. Conflict resolution on (date, source).
 */
export async function upsertSleepLog(data: typeof sleepLogs.$inferInsert) {
  const db = getDb();
  await db
    .insert(sleepLogs)
    .values(data)
    .onConflictDoUpdate({
      target: [sleepLogs.date, sleepLogs.source],
      set: {
        totalHours: data.totalHours,
        deepMin: data.deepMin,
        lightMin: data.lightMin,
        remMin: data.remMin,
        wakeMin: data.wakeMin,
        efficiency: data.efficiency,
        fitbitLogId: data.fitbitLogId,
        loggedAt: data.loggedAt,
      },
    });
}

/**
 * Upsert an activity log entry. Conflict resolution on (date, source).
 */
export async function upsertActivityLog(data: typeof activityLogs.$inferInsert) {
  const db = getDb();
  await db
    .insert(activityLogs)
    .values(data)
    .onConflictDoUpdate({
      target: [activityLogs.date, activityLogs.source],
      set: {
        steps: data.steps,
        caloriesOut: data.caloriesOut,
        activeMinutes: data.activeMinutes,
        strengthSession: data.strengthSession,
        strengthDuration: data.strengthDuration,
        run: data.run,
        runDuration: data.runDuration,
        walk: data.walk,
      },
    });
}

/**
 * Upsert a diet log entry. Conflict resolution on date only (no source column).
 */
export async function upsertDietLog(data: {
  date: string;
  mode: string;
  score: number;
  mealsJson?: unknown;
}) {
  const db = getDb();
  await db
    .insert(dietLogs)
    .values({
      date: data.date,
      mode: data.mode,
      score: data.score,
      mealsJson: data.mealsJson ?? null,
    })
    .onConflictDoUpdate({
      target: [dietLogs.date],
      set: {
        mode: data.mode,
        score: data.score,
        mealsJson: data.mealsJson ?? null,
      },
    });
}

/**
 * Upsert an alcohol log entry. Conflict resolution on date only (no source column).
 */
export async function upsertAlcoholLog(data: {
  date: string;
  totalDrinks: number;
  sessionsJson?: unknown;
  dry?: boolean;
}) {
  const db = getDb();
  await db
    .insert(alcoholLogs)
    .values({
      date: data.date,
      totalDrinks: data.totalDrinks,
      sessionsJson: data.sessionsJson ?? null,
      dry: data.dry ?? false,
    })
    .onConflictDoUpdate({
      target: [alcoholLogs.date],
      set: {
        totalDrinks: data.totalDrinks,
        sessionsJson: data.sessionsJson ?? null,
        dry: data.dry ?? false,
      },
    });
}

/**
 * Upsert a vacation log entry. Conflict resolution on date only.
 */
export async function upsertVacationLog(data: {
  date: string;
  vacationName: string;
  notes?: string | null;
}) {
  const db = getDb();
  await db
    .insert(vacationLogs)
    .values({
      date: data.date,
      vacationName: data.vacationName,
      notes: data.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [vacationLogs.date],
      set: {
        vacationName: data.vacationName,
        notes: data.notes ?? null,
      },
    });
}

/**
 * Delete a vacation log entry for a given date.
 */
export async function deleteVacationLog(date: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .delete(vacationLogs)
    .where(eq(vacationLogs.date, date))
    .returning();
  return result.length > 0;
}

// ─── getDayLog ───────────────────────────────────────────────────────────────

export interface DayLog {
  date: string;
  weight: (typeof weightLogs.$inferSelect) | null;
  sleep: (typeof sleepLogs.$inferSelect) | null;
  activity: (typeof activityLogs.$inferSelect) | null;
  heartRate: (typeof heartRateLogs.$inferSelect) | null;
  diet: (typeof dietLogs.$inferSelect) | null;
  alcohol: (typeof alcoholLogs.$inferSelect) | null;
  vacation: (typeof vacationLogs.$inferSelect) | null;
}

/**
 * Fetch all log types for a single date. Returns full row objects (including
 * mealsJson, sessionsJson) unlike getDayRecords which flattens to scalars.
 * Weight/sleep/activity prefer manual source, falling back to fitbit.
 */
export async function getDayLog(date: string): Promise<DayLog> {
  const db = getDb();

  const [weightRows, sleepRows, activityRows, heartRateRows, dietRows, alcoholRows, vacationRows] =
    await Promise.all([
      db.select().from(weightLogs).where(eq(weightLogs.date, date)).orderBy(desc(weightLogs.source)),
      db.select().from(sleepLogs).where(eq(sleepLogs.date, date)).orderBy(desc(sleepLogs.source)),
      db.select().from(activityLogs).where(eq(activityLogs.date, date)).orderBy(desc(activityLogs.source)),
      db.select().from(heartRateLogs).where(eq(heartRateLogs.date, date)),
      db.select().from(dietLogs).where(eq(dietLogs.date, date)),
      db.select().from(alcoholLogs).where(eq(alcoholLogs.date, date)),
      db.select().from(vacationLogs).where(eq(vacationLogs.date, date)),
    ]);

  return {
    date,
    weight: weightRows[0] ?? null,
    sleep: sleepRows[0] ?? null,
    activity: activityRows[0] ?? null,
    heartRate: heartRateRows[0] ?? null,
    diet: dietRows[0] ?? null,
    alcohol: alcoholRows[0] ?? null,
    vacation: vacationRows[0] ?? null,
  };
}

// ─── Scenario CRUD (S04) ────────────────────────────────────────────────────

/**
 * Save a "What if?" scenario query and its computed response.
 * Logs errors to stderr for observability (slice S04 requirement).
 */
export async function saveScenario(
  query: string,
  response: object,
  cascade?: object
) {
  const db = getDb();
  try {
    const rows = await db
      .insert(scenarios)
      .values({
        query,
        responseJson: response,
        cascadeJson: cascade ?? null,
      })
      .returning();
    return rows[0];
  } catch (err) {
    console.error("[scenarios] save failed:", err);
    throw err;
  }
}

/**
 * Get recent saved scenarios, ordered by newest first.
 * Default limit 20.
 */
export async function getScenarios(limit: number = 20) {
  const db = getDb();
  return db
    .select()
    .from(scenarios)
    .orderBy(desc(scenarios.createdAt))
    .limit(limit);
}

/**
 * Delete a saved scenario by primary key.
 * Returns true if a row was deleted, false if not found.
 */
export async function deleteScenario(id: number): Promise<boolean> {
  const db = getDb();
  try {
    const result = await db
      .delete(scenarios)
      .where(eq(scenarios.id, id))
      .returning();
    return result.length > 0;
  } catch (err) {
    console.error("[scenarios] delete failed:", err);
    throw err;
  }
}

// ─── Photo queries (progress photos) ─────────────────────────────────────────

export async function getPhotosForDate(date: string) {
  const db = getDb();
  return db.select().from(photos).where(eq(photos.date, date));
}

export async function getPreviousPhoto(beforeDate: string, type: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(photos)
    .where(and(sql`${photos.date} < ${beforeDate}`, eq(photos.type, type)))
    .orderBy(desc(photos.date))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPhotoTimeline(limit: number = 20) {
  const db = getDb();
  return db
    .select()
    .from(photos)
    .orderBy(desc(photos.date))
    .limit(limit);
}

export async function insertPhoto(data: typeof photos.$inferInsert) {
  const db = getDb();
  const rows = await db.insert(photos).values(data).returning();
  return rows[0];
}

export async function updatePhotoAnalysis(id: number, analysis: object) {
  const db = getDb();
  await db
    .update(photos)
    .set({ analysisJson: analysis })
    .where(eq(photos.id, id));
}

export async function getPhotoById(id: number) {
  const db = getDb();
  const rows = await db.select().from(photos).where(eq(photos.id, id));
  return rows[0] ?? null;
}

export async function deletePhoto(id: number): Promise<boolean> {
  const db = getDb();
  const result = await db.delete(photos).where(eq(photos.id, id)).returning();
  return result.length > 0;
}

// ─── User Profile & Milestones ───────────────────────────────────────────────

/**
 * Get the user profile for a given user ID.
 * Returns the full row or null if no profile exists.
 */
export async function getUserProfile(userId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get all milestones for a given user, ordered by sortOrder ascending.
 */
export async function getUserMilestones(userId: number) {
  const db = getDb();
  return db
    .select()
    .from(milestones)
    .where(eq(milestones.userId, userId))
    .orderBy(milestones.sortOrder);
}
