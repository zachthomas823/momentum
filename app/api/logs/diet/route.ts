import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dietLogs } from '@/lib/db/schema';
import { upsertDietLog } from '@/lib/db/queries';
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
      .from(dietLogs)
      .where(eq(dietLogs.date, date));

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
    const { date, mode, score, mealsJson } = body;

    if (!date || !mode || score == null) {
      return NextResponse.json(
        { error: 'date, mode, and score are required' },
        { status: 400 }
      );
    }

    if (!['vibes', 'meals'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be "vibes" or "meals"' },
        { status: 400 }
      );
    }

    if (typeof score !== 'number' || score < 1 || score > 5) {
      return NextResponse.json(
        { error: 'score must be a number between 1 and 5' },
        { status: 400 }
      );
    }

    await upsertDietLog({ date, mode, score, mealsJson });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
