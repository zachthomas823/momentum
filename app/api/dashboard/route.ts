// ─── Dashboard API ───────────────────────────────────────────────────────────
// GET /api/dashboard — assembles all dashboard data server-side.
// Engine functions are pure; this route wires them to Postgres data.

import { NextResponse } from "next/server";
import { getDayRecords, getLatestWeight } from "@/lib/db/queries";
import type { DayRecord } from "@/lib/db/queries";
import {
  derivedPace,
  tdeePipeline,
  checkMilestones,
  sma,
} from "@/lib/engine";
import type {
  PaceResult,
  TdeePipelineResult,
  MilestoneResult,
} from "@/lib/engine";
import { detectAll } from "@/lib/patterns";
import type { Nudge } from "@/lib/patterns";
import { TARGETS, daysTo } from "@/lib/engine/constants";
import type { Targets } from "@/lib/engine/constants";

// ─── Response Shape ──────────────────────────────────────────────────────────

export interface DashboardData {
  days: DayRecord[];
  bachelorPartyDays: number;
  weddingDays: number;
  currentWeight: number | null;
  currentBodyFat: number | null;
  weight7dSma: number | null;
  bf7dSma: number | null;
  pace: PaceResult;
  tdee: TdeePipelineResult;
  milestones: MilestoneResult[];
  scorecard: {
    strengthDays: number;
    dietLogDays: number;
    drinkingDays: number;
    avgSleep: number | null;
  };
  nudges: Nudge[];
  targets: Targets;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD using local date parts (never toISOString). */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Compute weekly scorecard from the last 7 records. */
function computeScorecard(days: DayRecord[]) {
  const last7 = days.slice(-7);

  const strengthDays = last7.filter((d) => d.strengthSession === true).length;
  const dietLogDays = last7.filter((d) => d.dietScore != null).length;
  const drinkingDays = last7.filter((d) => (d.totalDrinks ?? 0) > 0).length;

  const sleepVals = last7
    .map((d) => d.sleepTotalHours)
    .filter((v): v is number => v != null);
  const avgSleep =
    sleepVals.length > 0
      ? sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length
      : null;

  return { strengthDays, dietLogDays, drinkingDays, avgSleep };
}

// ─── GET Handler ─────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // Date range: last 30 days using user's local timezone
    const { todayLocal: getTodayLocal } = await import("@/lib/date-utils");
    const todayStr = getTodayLocal();
    const start = new Date(todayStr + "T12:00:00");
    start.setDate(start.getDate() - 29); // 30 days inclusive

    const [days, latestWeight] = await Promise.all([
      getDayRecords(localDateStr(start), todayStr),
      getLatestWeight(),
    ]);

    // Current measurements — fall back to TARGETS.startWeight if no data
    const currentWeight = latestWeight?.weightLbs ?? TARGETS.startWeight;
    const currentBodyFat = latestWeight?.bodyFatPct ?? null;

    // Engine computations
    const pace = derivedPace(days);
    const tdee = tdeePipeline(currentWeight, days);
    const milestones = checkMilestones(currentWeight);
    const scorecard = computeScorecard(days);
    const nudges = detectAll(days);
    const weight7dSma = sma(
      days.filter((d) => d.weightLbs != null).map((d) => d.weightLbs!),
      7
    );
    const bf7dSma = sma(
      days.filter((d) => d.bodyFatPct != null).map((d) => d.bodyFatPct!),
      7
    );

    const data: DashboardData = {
      days,
      bachelorPartyDays: daysTo(TARGETS.bachelorParty.date),
      weddingDays: daysTo(TARGETS.wedding.date),
      currentWeight: latestWeight?.weightLbs ?? null,
      currentBodyFat,
      weight7dSma,
      bf7dSma,
      pace,
      tdee,
      milestones,
      scorecard,
      nudges,
      targets: TARGETS,
    };

    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/dashboard] Error:", err);
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}
