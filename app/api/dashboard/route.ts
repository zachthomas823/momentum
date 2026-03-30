// ─── Dashboard API ───────────────────────────────────────────────────────────
// GET /api/dashboard — assembles all dashboard data server-side.
// Engine functions are pure; this route wires them to DB-backed profile data.

import { NextResponse } from "next/server";
import { getDayRecords, getLatestWeight, getUserProfile, getUserMilestones } from "@/lib/db/queries";
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
import type { Nudge, Persona } from "@/lib/patterns";
import { daysTo } from "@/lib/engine/constants";
import { verifySession } from "@/lib/auth/dal";

// ─── Fallback defaults (used when no profile exists in DB) ───────────────────

const DEFAULTS = {
  startWeight: 208.6,
  startBodyFat: 17.9,
  startDate: "2026-03-06",
  weeklyPaceLbs: 0.5,
  height: 72,
  age: 28,
  timezone: "America/Los_Angeles",
  name: "User",
  activityLevel: "moderate",
} as const;

// ─── Response Shape ──────────────────────────────────────────────────────────

export interface ProfileData {
  name: string | null;
  age: number;
  heightInches: number;
  startWeight: number;
  startBodyFat: number | null;
  startDate: string | null;
  weeklyPaceLbs: number;
  activityLevel: string;
  timezone: string;
}

export interface CountdownItem {
  label: string;
  icon: string;
  daysLeft: number;
  targetDate: string | null;
  targetWeight: number | null;
}

export interface MilestoneData {
  id: number;
  label: string;
  type: string;
  targetDate: string | null;
  targetWeight: number | null;
  targetBodyFat: number | null;
  isPrimary: boolean | null;
  sortOrder: number | null;
  achievedAt: Date | null;
}

export interface DashboardData {
  days: DayRecord[];
  countdowns: CountdownItem[];
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
  profile: ProfileData;
  userMilestones: MilestoneData[];
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
    // Auth — get userId for DB queries
    const session = await verifySession();
    const userId = session.userId as number;

    // Query profile and milestones from DB (graceful degradation on null)
    let profile: Awaited<ReturnType<typeof getUserProfile>> | null = null;
    let dbMilestones: Awaited<ReturnType<typeof getUserMilestones>> = [];

    try {
      [profile, dbMilestones] = await Promise.all([
        getUserProfile(userId),
        getUserMilestones(userId),
      ]);
    } catch (err) {
      console.error("[/api/dashboard] DB profile/milestones query failed, using defaults:", err);
    }

    // Resolve profile values with fallbacks
    const height = profile?.heightInches ?? DEFAULTS.height;
    const age = profile?.age ?? DEFAULTS.age;
    const startWeight = profile?.startWeight ?? DEFAULTS.startWeight;
    const weeklyPace = profile?.weeklyPaceLbs ?? DEFAULTS.weeklyPaceLbs;
    const timezone = profile?.timezone ?? DEFAULTS.timezone;

    // Date range: last 30 days using user's timezone
    const { todayLocal: getTodayLocal } = await import("@/lib/date-utils");
    const todayStr = getTodayLocal(timezone);
    const start = new Date(todayStr + "T12:00:00");
    start.setDate(start.getDate() - 29); // 30 days inclusive

    const [days, latestWeight] = await Promise.all([
      getDayRecords(localDateStr(start), todayStr),
      getLatestWeight(),
    ]);

    // Current measurements
    const currentWeight = latestWeight?.weightLbs ?? startWeight;
    const currentBodyFat = latestWeight?.bodyFatPct ?? null;

    // Engine computations with DB-backed params
    const pace = derivedPace(days, weeklyPace);
    const tdee = tdeePipeline(currentWeight, days, { height, age });

    // Map DB milestones with targetWeight to the format checkMilestones expects
    const milestoneTargets = dbMilestones
      .filter((m) => m.targetWeight != null)
      .map((m) => ({
        label: m.label,
        targetWeight: m.targetWeight!,
        icon: m.type === "event" ? "🎯" : "📉",
      }));
    const milestoneResults = checkMilestones(currentWeight, milestoneTargets, startWeight);

    // Build countdowns from event milestones with dates
    const countdowns: CountdownItem[] = dbMilestones
      .filter((m) => m.targetDate != null)
      .map((m) => ({
        label: m.label,
        icon: m.type === "event" ? "🎉" : "📉",
        daysLeft: daysTo(m.targetDate!, timezone),
        targetDate: m.targetDate,
        targetWeight: m.targetWeight,
      }));

    const scorecard = computeScorecard(days);
    const persona: Persona = (profile?.aiPersona as Persona) ?? 'coach';
    const nudges = detectAll(days, persona);
    const weight7dSma = sma(
      days.filter((d) => d.weightLbs != null).map((d) => d.weightLbs!),
      7
    );
    const bf7dSma = sma(
      days.filter((d) => d.bodyFatPct != null).map((d) => d.bodyFatPct!),
      7
    );

    // Build profile response object
    const profileData: ProfileData = {
      name: profile?.name ?? DEFAULTS.name,
      age: age,
      heightInches: height,
      startWeight: startWeight,
      startBodyFat: profile?.startBodyFat ?? DEFAULTS.startBodyFat,
      startDate: profile?.startDate ?? DEFAULTS.startDate,
      weeklyPaceLbs: weeklyPace,
      activityLevel: profile?.activityLevel ?? DEFAULTS.activityLevel,
      timezone: timezone,
    };

    // Map DB milestones to response shape
    const userMilestones: MilestoneData[] = dbMilestones.map((m) => ({
      id: m.id,
      label: m.label,
      type: m.type,
      targetDate: m.targetDate,
      targetWeight: m.targetWeight,
      targetBodyFat: m.targetBodyFat,
      isPrimary: m.isPrimary,
      sortOrder: m.sortOrder,
      achievedAt: m.achievedAt,
    }));

    const data: DashboardData = {
      days,
      countdowns,
      currentWeight: latestWeight?.weightLbs ?? null,
      currentBodyFat,
      weight7dSma,
      bf7dSma,
      pace,
      tdee,
      milestones: milestoneResults,
      scorecard,
      nudges,
      profile: profileData,
      userMilestones,
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
