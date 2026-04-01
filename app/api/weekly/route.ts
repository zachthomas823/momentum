// ─── Weekly Summary API ──────────────────────────────────────────────────────
// GET /api/weekly — returns current vs previous week stats with deltas,
// day-by-day breakdown, and logging consistency score.

import { NextRequest, NextResponse } from "next/server";
import { getDayRecords } from "@/lib/db/queries";
import type { DayRecord } from "@/lib/db/queries";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StatRow {
  label: string;
  key: string;
  current: number | null;
  previous: number | null;
  delta: number | null;
  /** "higher" = green when current > previous; "lower" = green when current < previous */
  goodDirection: "higher" | "lower";
  unit: string;
}

export interface WeeklyData {
  weekOf: string;
  currentWeek: StatRow[];
  previousWeek: StatRow[];
  days: DayRecord[];
  consistency: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD using local date parts (never toISOString). */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Given a date, compute Monday–Sunday boundaries for that week.
 * JavaScript getDay() returns 0=Sun, 1=Mon, ..., 6=Sat.
 * We shift so Monday=0.
 */
function weekBounds(dateStr: string): { start: string; end: string } {
  const d = new Date(dateStr + "T12:00:00"); // noon to avoid DST edge
  const dow = d.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow; // shift to Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: localDateStr(monday), end: localDateStr(sunday) };
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function count(values: (boolean | null)[], target: boolean): number {
  return values.filter((v) => v === target).length;
}

function round2(v: number | null): number | null {
  return v != null ? Math.round(v * 100) / 100 : null;
}

function delta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return Math.round((current - previous) * 100) / 100;
}

/** True if the day has any non-null logged data. */
function hasData(d: DayRecord): boolean {
  return (
    d.weightLbs != null ||
    d.sleepTotalHours != null ||
    d.steps != null ||
    d.dietScore != null ||
    d.totalDrinks != null ||
    d.dry != null ||
    d.strengthSession != null ||
    d.restingHr != null
  );
}

// ─── Stat Computation ────────────────────────────────────────────────────────

function computeStats(days: DayRecord[]): Omit<StatRow, "delta" | "previous">[] {
  return [
    {
      label: "Strength Sessions",
      key: "strength",
      current: count(days.map((d) => d.strengthSession), true),
      goodDirection: "higher" as const,
      unit: "days",
    },
    {
      label: "Avg Diet Score",
      key: "diet",
      current: round2(avg(days.map((d) => d.dietScore))),
      goodDirection: "higher" as const,
      unit: "/5",
    },
    {
      label: "Drinking Days",
      key: "drinks",
      current: days.filter((d) => (d.totalDrinks ?? 0) > 0).length,
      goodDirection: "lower" as const,
      unit: "days",
    },
    {
      label: "Avg Sleep",
      key: "sleep",
      current: round2(avg(days.map((d) => d.sleepTotalHours))),
      goodDirection: "higher" as const,
      unit: "hrs",
    },
    {
      label: "Avg Weight",
      key: "weight",
      current: round2(avg(days.map((d) => d.weightLbs))),
      goodDirection: "lower" as const,
      unit: "lbs",
    },
  ];
}

// ─── GET Handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { todayLocal: getTodayLocal } = await import("@/lib/date-utils");
    const weekOf = searchParams.get("weekOf") ?? getTodayLocal();

    // Rolling 7-day windows: last 7 days vs the 7 days before that
    const today = new Date(weekOf + "T12:00:00");
    const sevenAgo = new Date(today);
    sevenAgo.setDate(today.getDate() - 6); // 7 days inclusive
    const eightAgo = new Date(today);
    eightAgo.setDate(today.getDate() - 7);
    const fourteenAgo = new Date(today);
    fourteenAgo.setDate(today.getDate() - 13); // 7 days inclusive

    const currentStart = localDateStr(sevenAgo);
    const currentEnd = localDateStr(today);
    const previousStart = localDateStr(fourteenAgo);
    const previousEnd = localDateStr(eightAgo);

    // Fetch both windows
    const [currentDays, previousDays] = await Promise.all([
      getDayRecords(currentStart, currentEnd),
      getDayRecords(previousStart, previousEnd),
    ]);

    // Compute stats for each week
    const currentStats = computeStats(currentDays);
    const previousStats = computeStats(previousDays);

    // Build stat rows with deltas
    const statRows: StatRow[] = currentStats.map((cs, i) => {
      const ps = previousStats[i];
      return {
        label: cs.label,
        key: cs.key,
        current: cs.current,
        previous: ps.current,
        delta: delta(cs.current, ps.current),
        goodDirection: cs.goodDirection,
        unit: cs.unit,
      };
    });

    // Logging consistency: days with any data / 7
    const consistency = currentDays.filter(hasData).length / 7;

    const data: WeeklyData = {
      weekOf,
      currentWeek: statRows,
      previousWeek: statRows, // same array — consumer reads .previous from statRows
      days: currentDays,
      consistency: Math.round(consistency * 100) / 100,
    };

    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/weekly] Error:", err);
    return NextResponse.json(
      { error: "Failed to load weekly data" },
      { status: 500 }
    );
  }
}
