import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { alcoholLogs } from '@/lib/db/schema';
import { upsertAlcoholLog } from '@/lib/db/queries';
import { eq } from 'drizzle-orm';

interface DrinkSession {
  drinks: number;
  type: string;
  timestamp?: string;
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date');
    if (!date) {
      return NextResponse.json({ error: 'date query param required' }, { status: 400 });
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(alcoholLogs)
      .where(eq(alcoholLogs.date, date));

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
    const { date, drinks, type, dry } = body;

    if (!date) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 });
    }

    // Dry day: reset to zero drinks, clear sessions
    if (dry === true) {
      await upsertAlcoholLog({
        date,
        totalDrinks: 0,
        dry: true,
        sessionsJson: [],
      });
      return NextResponse.json({ success: true });
    }

    // Add session: requires drinks and type
    if (drinks == null || !type) {
      return NextResponse.json(
        { error: 'drinks and type are required (or set dry: true)' },
        { status: 400 }
      );
    }

    if (typeof drinks !== 'number' || drinks < 0) {
      return NextResponse.json(
        { error: 'drinks must be a non-negative number' },
        { status: 400 }
      );
    }

    // Read existing log for additive merge
    const db = getDb();
    const existing = await db
      .select()
      .from(alcoholLogs)
      .where(eq(alcoholLogs.date, date));

    const existingLog = existing[0];
    const existingSessions: DrinkSession[] = Array.isArray(existingLog?.sessionsJson)
      ? (existingLog.sessionsJson as DrinkSession[])
      : [];

    const newSession: DrinkSession = {
      drinks,
      type,
      timestamp: new Date().toISOString(),
    };

    const mergedSessions = [...existingSessions, newSession];
    const totalDrinks = mergedSessions.reduce((sum, s) => sum + s.drinks, 0);

    await upsertAlcoholLog({
      date,
      totalDrinks,
      sessionsJson: mergedSessions,
      dry: false,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
