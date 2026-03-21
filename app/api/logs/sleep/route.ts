import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { sleepLogs } from '@/lib/db/schema';
import { upsertSleepLog } from '@/lib/db/queries';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date');
    if (!date) {
      return NextResponse.json({ error: 'date query param required' }, { status: 400 });
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(sleepLogs)
      .where(eq(sleepLogs.date, date));

    return NextResponse.json(rows[0] ?? null);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, totalHours } = body;

    if (!date || totalHours == null) {
      return NextResponse.json(
        { error: 'date and totalHours are required' },
        { status: 400 }
      );
    }

    await upsertSleepLog({
      date,
      totalHours,
      source: 'manual',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
