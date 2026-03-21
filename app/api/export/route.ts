import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  weightLogs,
  sleepLogs,
  activityLogs,
  heartRateLogs,
  dietLogs,
  alcoholLogs,
  fitbitTokens,
  syncHistory,
  config,
  scenarios,
} from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

/**
 * GET /api/export
 *
 * Exports all 9 Postgres tables as a JSON download.
 * Fitbit token secrets (accessToken, refreshToken) are redacted.
 */
export async function GET() {
  try {
    const db = getDb();

    const [
      weight,
      sleep,
      activity,
      heartRate,
      diet,
      alcohol,
      tokens,
      syncs,
      configRows,
      scenarioRows,
    ] = await Promise.all([
      db.select().from(weightLogs).orderBy(desc(weightLogs.date)),
      db.select().from(sleepLogs).orderBy(desc(sleepLogs.date)),
      db.select().from(activityLogs).orderBy(desc(activityLogs.date)),
      db.select().from(heartRateLogs).orderBy(desc(heartRateLogs.date)),
      db.select().from(dietLogs).orderBy(desc(dietLogs.date)),
      db.select().from(alcoholLogs).orderBy(desc(alcoholLogs.date)),
      db
        .select({
          id: fitbitTokens.id,
          userId: fitbitTokens.userId,
          scopes: fitbitTokens.scopes,
          expiresAt: fitbitTokens.expiresAt,
          createdAt: fitbitTokens.createdAt,
          updatedAt: fitbitTokens.updatedAt,
        })
        .from(fitbitTokens),
      db.select().from(syncHistory).orderBy(desc(syncHistory.startedAt)),
      db.select().from(config),
      db.select().from(scenarios).orderBy(desc(scenarios.createdAt)),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      tables: {
        weight_logs: weight,
        sleep_logs: sleep,
        activity_logs: activity,
        heart_rate_logs: heartRate,
        diet_logs: diet,
        alcohol_logs: alcohol,
        fitbit_tokens: tokens, // accessToken & refreshToken excluded from select
        sync_history: syncs,
        config: configRows,
        scenarios: scenarioRows,
      },
    };

    const today = new Date().toISOString().slice(0, 10);

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="fitness-tracker-export-${today}.json"`,
      },
    });
  } catch (err) {
    console.error('[export] Failed:', (err as Error).message);
    return NextResponse.json(
      { error: 'Export failed', message: (err as Error).message },
      { status: 500 }
    );
  }
}
