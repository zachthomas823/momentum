import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { vacationLogs } from '@/lib/db/schema';
import { upsertVacationLog, deleteVacationLog } from '@/lib/db/queries';
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
      .from(vacationLogs)
      .where(eq(vacationLogs.date, date));

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
    const { date, vacationName, notes } = body;

    if (!date || !vacationName) {
      return NextResponse.json(
        { error: 'date and vacationName are required' },
        { status: 400 }
      );
    }

    await upsertVacationLog({ date, vacationName, notes });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date');
    if (!date) {
      return NextResponse.json({ error: 'date query param required' }, { status: 400 });
    }

    const deleted = await deleteVacationLog(date);
    return NextResponse.json({ deleted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
