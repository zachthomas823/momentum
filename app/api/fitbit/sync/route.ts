import { NextResponse } from 'next/server';
import { syncFromFitbit } from '@/lib/fitbit/sync';
import { FitbitReauthRequired } from '@/lib/fitbit/client';

export async function POST() {
  try {
    const result = await syncFromFitbit();

    return NextResponse.json({
      ok: true,
      syncId: result.syncId,
      dateRange: result.dateRange,
      durationMs: result.durationMs,
      stats: result.stats,
    });
  } catch (err) {
    if (err instanceof FitbitReauthRequired) {
      return NextResponse.json(
        { ok: false, error: 'Fitbit authorization required', reauth: true },
        { status: 401 }
      );
    }

    console.error('[fitbit] Sync failed:', (err as Error).message);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
