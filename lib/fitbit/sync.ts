// ─── Fitbit data sync orchestrator ──────────────────────────────────────────
// Pulls data from 6 Fitbit API endpoint groups, normalizes, and upserts to Postgres.
// Records every sync attempt in sync_history for observability.

import { eq, desc, and, isNotNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  weightLogs,
  sleepLogs,
  activityLogs,
  heartRateLogs,
  syncHistory,
} from '@/lib/db/schema';
import { fitbitFetch } from './client';
import type {
  FitbitWeightResponse,
  FitbitBodyFatResponse,
  FitbitSleepResponse,
  FitbitActivityResponse,
  FitbitHeartRateResponse,
  FitbitHRVResponse,
} from './types';
import {
  normalizeWeightLogs,
  normalizeSleepLogs,
  normalizeActivityLog,
  normalizeHeartRateLog,
} from './normalize';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Sleep helper: returns ms to wait until rate limit resets */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch JSON from a Fitbit API path. Checks rate limit headers and pauses
 * if remaining < 10. Returns the parsed JSON body.
 */
async function fitbitJson<T>(path: string): Promise<T> {
  const res = await fitbitFetch(path);

  // Rate limit enforcement — pause if close to exhaustion
  const remaining = res.headers.get('Fitbit-Rate-Limit-Remaining');
  if (remaining !== null) {
    const rem = parseInt(remaining, 10);
    if (rem < 10) {
      const resetSecs = parseInt(res.headers.get('Fitbit-Rate-Limit-Reset') ?? '60', 10);
      console.warn(`[fitbit] Rate limit low (${rem} remaining). Pausing ${resetSecs}s…`);
      await sleep(resetSecs * 1000);
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fitbit API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Sync stats tracker ─────────────────────────────────────────────────────

interface SyncStats {
  weight: number;
  bodyFat: number;
  sleep: number;
  activity: number;
  heartRate: number;
  total: number;
}

function emptyStats(): SyncStats {
  return { weight: 0, bodyFat: 0, sleep: 0, activity: 0, heartRate: 0, total: 0 };
}

// ─── Main sync function ─────────────────────────────────────────────────────

export interface SyncResult {
  stats: SyncStats;
  durationMs: number;
  syncId: number;
  dateRange: { start: string; end: string };
}

/**
 * Full Fitbit data sync pipeline.
 *
 * 1. Determines sync window (last completed sync → today, or last 30 days)
 * 2. Fetches weight, body fat, sleep, activity, HR, HRV from Fitbit API
 * 3. Normalizes and upserts to Postgres (idempotent via onConflictDoUpdate)
 * 4. Records sync attempt in sync_history
 */
export async function syncFromFitbit(): Promise<SyncResult> {
  const db = getDb();
  const startedAt = new Date();
  const stats = emptyStats();

  // Insert a sync_history row at start (we'll update on completion)
  const [syncRow] = await db
    .insert(syncHistory)
    .values({ startedAt })
    .returning({ id: syncHistory.id });
  const syncId = syncRow.id;

  try {
    // ── Determine sync window ──────────────────────────────────────────────
    const lastCompleted = await db
      .select({ completedAt: syncHistory.completedAt })
      .from(syncHistory)
      .where(and(isNotNull(syncHistory.completedAt), isNotNull(syncHistory.recordsSynced)))
      .orderBy(desc(syncHistory.completedAt))
      .limit(1);

    const end = new Date();
    let start: Date;
    if (lastCompleted.length > 0 && lastCompleted[0].completedAt) {
      start = new Date(lastCompleted[0].completedAt);
    } else {
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const startStr = fmtDate(start);
    const endStr = fmtDate(end);
    console.log(`[fitbit] Sync window: ${startStr} → ${endStr}`);

    // ── 1. Weight Logs ────────────────────────────────────────────────────
    console.log('[fitbit] Fetching weight logs…');
    const weightRes = await fitbitJson<FitbitWeightResponse>(
      `/1/user/-/body/log/weight/date/${startStr}/${endStr}.json`
    );

    // ── 2. Body Fat Logs (separate endpoint) ──────────────────────────────
    console.log('[fitbit] Fetching body fat logs…');
    const bodyFatRes = await fitbitJson<FitbitBodyFatResponse>(
      `/1/user/-/body/log/fat/date/${startStr}/${endStr}.json`
    );
    stats.bodyFat = bodyFatRes.fat?.length ?? 0;

    // ── Normalize & upsert weight ─────────────────────────────────────────
    const normalizedWeight = normalizeWeightLogs(weightRes.weight ?? [], bodyFatRes.fat ?? []);
    for (const row of normalizedWeight) {
      await db
        .insert(weightLogs)
        .values(row)
        .onConflictDoUpdate({
          target: [weightLogs.date, weightLogs.source],
          set: {
            weightLbs: row.weightLbs,
            bodyFatPct: row.bodyFatPct,
            bmi: row.bmi,
            fitbitLogId: row.fitbitLogId,
            loggedAt: row.loggedAt,
          },
        });
    }
    stats.weight = normalizedWeight.length;

    // ── 3. Sleep Logs ─────────────────────────────────────────────────────
    console.log('[fitbit] Fetching sleep logs…');
    const sleepRes = await fitbitJson<FitbitSleepResponse>(
      `/1.2/user/-/sleep/date/${startStr}/${endStr}.json`
    );
    const normalizedSleep = normalizeSleepLogs(sleepRes.sleep ?? []);
    for (const row of normalizedSleep) {
      await db
        .insert(sleepLogs)
        .values(row)
        .onConflictDoUpdate({
          target: [sleepLogs.date, sleepLogs.source],
          set: {
            totalHours: row.totalHours,
            deepMin: row.deepMin,
            lightMin: row.lightMin,
            remMin: row.remMin,
            wakeMin: row.wakeMin,
            efficiency: row.efficiency,
            fitbitLogId: row.fitbitLogId,
            loggedAt: row.loggedAt,
          },
        });
    }
    stats.sleep = normalizedSleep.length;

    // ── 4–6. Per-day endpoints: Activity, HR, HRV ─────────────────────────
    const days = getDaysInRange(start, end);
    console.log(`[fitbit] Fetching activity/HR/HRV for ${days.length} days…`);

    for (const day of days) {
      // Activity
      try {
        const actRes = await fitbitJson<FitbitActivityResponse>(
          `/1/user/-/activities/date/${day}.json`
        );
        if (actRes.summary) {
          const row = normalizeActivityLog(day, actRes.summary);
          await db
            .insert(activityLogs)
            .values(row)
            .onConflictDoUpdate({
              target: [activityLogs.date, activityLogs.source],
              set: {
                steps: row.steps,
                caloriesOut: row.caloriesOut,
                activeMinutes: row.activeMinutes,
              },
            });
          stats.activity++;
        }
      } catch (err) {
        console.warn(`[fitbit] Activity fetch failed for ${day}:`, (err as Error).message);
      }

      // Heart Rate
      try {
        const hrRes = await fitbitJson<FitbitHeartRateResponse>(
          `/1/user/-/activities/heart/date/${day}/1d.json`
        );
        const hrDay = hrRes['activities-heart']?.[0];

        // HRV (separate call)
        let hrvEntry;
        try {
          const hrvRes = await fitbitJson<FitbitHRVResponse>(
            `/1/user/-/hrv/date/${day}.json`
          );
          hrvEntry = hrvRes.hrv?.[0];
        } catch {
          // HRV may not be available for all days — non-fatal
        }

        if (hrDay?.value) {
          const row = normalizeHeartRateLog(day, hrDay.value, hrvEntry);
          await db
            .insert(heartRateLogs)
            .values(row)
            .onConflictDoUpdate({
              target: [heartRateLogs.date, heartRateLogs.source],
              set: {
                restingHr: row.restingHr,
                hrvRmssd: row.hrvRmssd,
                zonesJson: row.zonesJson,
              },
            });
          stats.heartRate++;
        }
      } catch (err) {
        console.warn(`[fitbit] HR fetch failed for ${day}:`, (err as Error).message);
      }
    }

    // ── Finalize sync history ─────────────────────────────────────────────
    stats.total = stats.weight + stats.sleep + stats.activity + stats.heartRate;
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    await db
      .update(syncHistory)
      .set({
        completedAt,
        recordsSynced: stats.total,
      })
      .where(eq(syncHistory.id, syncId));

    console.log(`[fitbit] Sync complete: ${stats.total} records in ${durationMs}ms`);
    return { stats, durationMs, syncId, dateRange: { start: startStr, end: endStr } };
  } catch (err) {
    // Record the error in sync_history so it's visible
    const errorMsg = (err as Error).message ?? String(err);
    await db
      .update(syncHistory)
      .set({
        completedAt: new Date(),
        error: errorMsg,
        recordsSynced: stats.total,
      })
      .where(eq(syncHistory.id, syncId));

    throw err; // Re-throw so the API handler can respond appropriately
  }
}

// ─── Date range helper ──────────────────────────────────────────────────────

/** Generate an array of 'YYYY-MM-DD' strings for each day in [start, end]. */
function getDaysInRange(start: Date, end: Date): string[] {
  const days: string[] = [];
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  while (current <= endDay) {
    days.push(fmtDate(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}
