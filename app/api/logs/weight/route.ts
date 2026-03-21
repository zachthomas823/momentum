import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { weightLogs } from '@/lib/db/schema';
import { upsertWeightLog } from '@/lib/db/queries';
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
      .from(weightLogs)
      .where(eq(weightLogs.date, date));

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
    const { date, weightLbs, bodyFatPct } = body;

    if (!date || weightLbs == null) {
      return NextResponse.json(
        { error: 'date and weightLbs are required' },
        { status: 400 }
      );
    }

    await upsertWeightLog({
      date,
      weightLbs,
      bodyFatPct: bodyFatPct ?? null,
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
