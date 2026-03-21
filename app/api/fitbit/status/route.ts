import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { fitbitTokens, syncHistory } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

/**
 * GET /api/fitbit/status
 *
 * Returns Fitbit connection status and last sync info.
 * Used by the Settings page to show connection state.
 */
export async function GET() {
  try {
    const db = getDb();

    const [tokenRows, lastSync] = await Promise.all([
      db
        .select({
          id: fitbitTokens.id,
          userId: fitbitTokens.userId,
          expiresAt: fitbitTokens.expiresAt,
          updatedAt: fitbitTokens.updatedAt,
        })
        .from(fitbitTokens)
        .limit(1),
      db
        .select()
        .from(syncHistory)
        .orderBy(desc(syncHistory.startedAt))
        .limit(1),
    ]);

    const connected = tokenRows.length > 0;
    const token = tokenRows[0] ?? null;
    const sync = lastSync[0] ?? null;

    return NextResponse.json({
      connected,
      userId: token?.userId ?? null,
      tokenExpired: token ? new Date(token.expiresAt) < new Date() : null,
      lastSync: sync
        ? {
            startedAt: sync.startedAt,
            completedAt: sync.completedAt,
            recordsSynced: sync.recordsSynced,
            error: sync.error,
          }
        : null,
    });
  } catch (err) {
    console.error('[fitbit/status] Failed:', (err as Error).message);
    return NextResponse.json(
      { connected: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
