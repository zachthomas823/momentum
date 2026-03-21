import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { activityLogs } from '@/lib/db/schema';
import { upsertActivityLog } from '@/lib/db/queries';
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
      .from(activityLogs)
      .where(eq(activityLogs.date, date));

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
    const { date, type, duration } = body;

    if (!date || !type) {
      return NextResponse.json(
        { error: 'date and type are required' },
        { status: 400 }
      );
    }

    const validTypes = ['strength', 'run', 'walk'] as const;
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Map type to the correct boolean + duration columns
    const data: Parameters<typeof upsertActivityLog>[0] = {
      date,
      source: 'manual',
      strengthSession: type === 'strength',
      strengthDuration: type === 'strength' ? (duration ?? null) : null,
      run: type === 'run',
      runDuration: type === 'run' ? (duration ?? null) : null,
      walk: type === 'walk',
    };

    await upsertActivityLog(data);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
