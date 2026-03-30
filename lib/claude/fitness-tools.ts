// ─── Fitness Data MCP Server for Claude Agent SDK ────────────────────────────
// Exposes the user's logged fitness data as tools that Claude can call during
// multi-turn conversations. Runs in-process (same Node.js runtime as the API
// route) with full database access.

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  getDayLog,
  getDayRecords,
  getLatestWeight,
  getUserProfile,
  getUserMilestones,
} from "@/lib/db/queries";
import {
  exerciseImpact,
  alcoholImpact,
  sleepImpact,
  dietImpact,
  sma,
  derivedPace,
  tdeePipeline,
  checkMilestones,
} from "@/lib/engine";

import { todayLocal, formatDateLocal } from "@/lib/date-utils";

// Fallback defaults when no DB profile exists
const DEFAULTS = {
  startWeight: 208.6,
  weeklyPaceLbs: 0.5,
  height: 72,
  age: 28,
} as const;

export function createFitnessServer() {
  return createSdkMcpServer({
    name: "fitness",
    tools: [
      // ── Get today's full data ─────────────────────────────────────────
      tool(
        "get_today_data",
        "Get all logged data for today: exercise (type, duration), sleep (hours, stages), diet (score, mode), weight, body fat, steps, active minutes, heart rate, HRV. Use this when the user asks about 'today' or 'my workout' or 'this morning'.",
        {},
        async () => {
          const today = todayLocal();
          const dayLog = await getDayLog(today);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(dayLog, null, 2) }],
          };
        }
      ),

      // ── Get recent day records ────────────────────────────────────────
      tool(
        "get_recent_days",
        "Get day-by-day records for the last N days. Each day includes: weight, body fat, sleep hours/stages, steps, exercise, diet score, drinks, heart rate. Use this for questions about trends, patterns, or 'this week'.",
        {
          days: z.number().min(1).max(30).default(7).describe("Number of days to look back"),
        },
        async ({ days }) => {
          const end = new Date();
          const start = new Date(end);
          start.setDate(start.getDate() - (days - 1));
          const records = await getDayRecords(formatDateLocal(start), formatDateLocal(end));
          return {
            content: [{ type: "text" as const, text: JSON.stringify(records, null, 2) }],
          };
        }
      ),

      // ── Get weight trend + pace ───────────────────────────────────────
      tool(
        "get_weight_trend",
        "Get current weight metrics: latest weight, 7-day moving average, body fat %, weekly loss pace, TDEE estimate, milestones reached. Use this for questions about progress, pace, or 'how am I doing'.",
        {},
        async () => {
          const end = new Date();
          const start = new Date(end);
          start.setDate(start.getDate() - 29);

          // Query DB for profile and milestones (userId 1 for MCP server context)
          let profile: Awaited<ReturnType<typeof getUserProfile>> | null = null;
          let dbMilestones: Awaited<ReturnType<typeof getUserMilestones>> = [];
          try {
            [profile, dbMilestones] = await Promise.all([
              getUserProfile(1),
              getUserMilestones(1),
            ]);
          } catch (err) {
            console.error("[fitness-tools] DB profile query failed, using defaults:", err);
          }

          const height = profile?.heightInches ?? DEFAULTS.height;
          const age = profile?.age ?? DEFAULTS.age;
          const startWeight = profile?.startWeight ?? DEFAULTS.startWeight;
          const weeklyPace = profile?.weeklyPaceLbs ?? DEFAULTS.weeklyPaceLbs;

          const [days, latestWeight] = await Promise.all([
            getDayRecords(formatDateLocal(start), formatDateLocal(end)),
            getLatestWeight(),
          ]);

          const currentWeight = latestWeight?.weightLbs ?? startWeight;
          const weightValues = days
            .filter((d) => d.weightLbs != null)
            .map((d) => d.weightLbs!);
          const bfValues = days
            .filter((d) => d.bodyFatPct != null)
            .map((d) => d.bodyFatPct!);

          const pace = derivedPace(days, weeklyPace);
          const pipeline = tdeePipeline(currentWeight, days, { height, age });

          // Map DB milestones with targetWeight for checkMilestones
          const milestoneTargets = dbMilestones
            .filter((m) => m.targetWeight != null)
            .map((m) => ({
              label: m.label,
              targetWeight: m.targetWeight!,
              icon: m.type === "event" ? "🎯" : "📉",
            }));
          const milestones = checkMilestones(currentWeight, milestoneTargets, startWeight);

          // Build milestone targets for response
          const milestoneInfo = dbMilestones
            .filter((m) => m.targetDate != null || m.targetWeight != null)
            .map((m) => ({
              label: m.label,
              targetDate: m.targetDate,
              targetWeight: m.targetWeight,
            }));

          const result = {
            currentWeight: latestWeight?.weightLbs ?? null,
            currentBodyFat: latestWeight?.bodyFatPct ?? null,
            weight7dSma: sma(weightValues, 7),
            bf7dSma: sma(bfValues, 7),
            pace: {
              rate: pace.rate,
              confidence: pace.confidence,
              source: pace.source,
            },
            tdee: Math.round(pipeline.tdee),
            bmr: Math.round(pipeline.bmr),
            avgSteps: pipeline.avgSteps,
            milestones,
            targets: milestoneInfo,
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        }
      ),

      // ── Calculate exercise impact ─────────────────────────────────────
      tool(
        "calculate_impact",
        "Calculate the physiological impact of a specific scenario using the evidence-based engine. Supports alcohol (drink count), sleep (hours), exercise (type + duration), and diet (score 1-5). Returns kcal impact, trajectory shift, recovery time, and confidence tier.",
        {
          alcohol: z.number().min(0).max(30).optional().describe("Number of drinks"),
          sleep: z.number().min(0).max(16).optional().describe("Hours of sleep"),
          exerciseType: z.enum(["strength", "run"]).optional().describe("Exercise type"),
          exerciseDuration: z.number().min(1).max(300).optional().describe("Exercise duration in minutes"),
          diet: z.number().min(1).max(5).optional().describe("Diet score (1=Dumpster Fire, 5=Sniper Mode)"),
        },
        async ({ alcohol, sleep, exerciseType, exerciseDuration, diet }) => {
          const results: Record<string, unknown> = {};

          if (alcohol != null && alcohol > 0) {
            results.alcohol = alcoholImpact(alcohol);
          }
          if (sleep != null) {
            results.sleep = sleepImpact(sleep);
          }
          if (exerciseType && exerciseDuration) {
            results.exercise = exerciseImpact(exerciseType, exerciseDuration);
          }
          if (diet != null) {
            results.diet = dietImpact(diet);
          }

          return {
            content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
          };
        }
      ),
    ],
  });
}
