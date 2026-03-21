// ─── POST /api/impact/analyze ────────────────────────────────────────────────
// Handles compound "What if?" queries via Claude API with personalized context.
// Falls back to local keyword parser on timeout (3s), error, or missing API key.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseQuery } from "@/lib/engine/keywords";
import {
  getLast14Days,
  getLatestWeight,
} from "@/lib/db/queries";
import {
  tdeePipeline,
  derivedPace,
  checkMilestones,
  scenarioImpact,
} from "@/lib/engine";
import { TARGETS } from "@/lib/engine/constants";

// ─── System Prompt (9 locked rules) ─────────────────────────────────────────

const SYSTEM_PROMPT = `You are a body composition advisor for a single user targeting a wedding on Sept 5, 2026. You analyze "What if?" scenarios about diet, alcohol, sleep, and exercise decisions.

Rules you MUST follow on every response:

Rule 1: Always give RANGES, never point estimates. Use [low, high] bounds for any numerical claim.
Rule 2: Mark every claim with a confidence tier: 🟢 Well-established / 🟡 Evidence-supported / 🔴 Plausible but uncertain.
Rule 3: Frame positively — emphasize recovery paths, not blame. "Letting loose" is valid input.
Rule 4: Be specific about mechanisms — reference fat oxidation, muscle protein synthesis (MPS), sleep architecture, glycogen, cortisol, ghrelin/leptin when relevant.
Rule 5: Keep responses under 150 words.
Rule 6: Reference the user's actual data when relevant — their current weight, pace, recent patterns.
Rule 7: Engine-constrained — do not invent physiological claims beyond established evidence tables. If uncertain, say so.
Rule 8: Use relatable equivalents — frame impacts in "clean days" (1 clean day ≈ 0.07 lbs deficit). Example: "This could offset 2-3 clean days."
Rule 9: No calorie counting language — use diet quality tiers (Sniper Mode, Dialed In, Cruise Control, Meh, Dumpster Fire) instead of calorie numbers when framing advice.`;

// ─── Context Assembly ────────────────────────────────────────────────────────

async function assembleUserContext(): Promise<string> {
  const [days, latestWeight] = await Promise.all([
    getLast14Days(),
    getLatestWeight(),
  ]);

  const currentWeight = latestWeight?.weightLbs ?? TARGETS.startWeight;
  const pipeline = tdeePipeline(currentWeight, days);
  const pace = derivedPace(days);
  const milestones = checkMilestones(currentWeight);

  // Summarize last 14 days
  const daysWithData = days.filter(
    (d) => d.weightLbs || d.sleepTotalHours || d.dietScore || d.totalDrinks != null
  );
  const avgSleep =
    daysWithData.filter((d) => d.sleepTotalHours).length > 0
      ? daysWithData
          .filter((d) => d.sleepTotalHours)
          .reduce((s, d) => s + d.sleepTotalHours!, 0) /
        daysWithData.filter((d) => d.sleepTotalHours).length
      : null;
  const avgDiet =
    daysWithData.filter((d) => d.dietScore).length > 0
      ? daysWithData
          .filter((d) => d.dietScore)
          .reduce((s, d) => s + d.dietScore!, 0) /
        daysWithData.filter((d) => d.dietScore).length
      : null;
  const drinkDays = daysWithData.filter((d) => d.totalDrinks && d.totalDrinks > 0);
  const totalDrinks = drinkDays.reduce((s, d) => s + (d.totalDrinks ?? 0), 0);

  const lines: string[] = [
    `Current weight: ${currentWeight} lbs`,
    `BMR: ${Math.round(pipeline.bmr)} kcal | TDEE: ${Math.round(pipeline.tdee)} kcal`,
    `Average steps: ${pipeline.avgSteps}/day`,
    `Pace: ${pace.rate.toFixed(2)} lbs/week (${pace.confidence} confidence, ${pace.source})`,
    `Target: ${TARGETS.wedding.weight} lbs by ${TARGETS.wedding.date}`,
  ];

  if (avgSleep != null) lines.push(`Avg sleep (14d): ${avgSleep.toFixed(1)}h`);
  if (avgDiet != null) lines.push(`Avg diet score (14d): ${avgDiet.toFixed(1)}/5`);
  if (drinkDays.length > 0)
    lines.push(`Alcohol (14d): ${totalDrinks} drinks across ${drinkDays.length} days`);
  if (milestones.length > 0)
    lines.push(`Milestones hit: ${milestones.map((m) => m.label).join(", ")}`);

  return lines.join("\n");
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let fallbackTriggered = false;

  try {
    const body = await request.json();
    const query = body?.query;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or empty 'query' field" },
        { status: 400 }
      );
    }

    const trimmedQuery = query.trim();

    // Try local keyword parser first as potential fallback
    const localResult = parseQuery(trimmedQuery);

    // Resolve credentials: prefer API key, fall back to OAuth auth token
    // API key: standard Anthropic API (ANTHROPIC_API_KEY, sk-ant-api03-...)
    // Auth token: Claude Max/Pro subscription via `claude setup-token` (ANTHROPIC_AUTH_TOKEN, sk-ant-oat01-...)
    const apiKey = process.env.ANTHROPIC_API_KEY ?? null;
    const authToken = process.env.ANTHROPIC_AUTH_TOKEN ?? null;
    const hasCredentials = apiKey || authToken;
    const authMethod = apiKey ? "api_key" : "auth_token";

    if (!hasCredentials) {
      console.error(
        `[impact/analyze] No ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN — using local fallback | query="${trimmedQuery}" | latency=${Date.now() - startTime}ms`
      );

      if (localResult) {
        return NextResponse.json({
          response: localResult.summary,
          confidence: localResult.confidence,
          fallback: true,
          mechanismChain: localResult.mechanismChain,
          relatableEquiv: localResult.relatableEquiv,
          trajectoryShift: localResult.trajectoryShift,
          category: localResult.category,
        });
      }

      return NextResponse.json(
        { error: "Claude API unavailable — set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN", fallback: true },
        { status: 503 }
      );
    }

    // ── Race: Claude API vs 3-second timeout ──────────────────────────────

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const claudePromise = (async () => {
      // Build client with whichever credential is available
      // SDK auto-resolves: apiKey → X-Api-Key header, authToken → Authorization: Bearer header
      const client = new Anthropic({
        ...(apiKey ? { apiKey } : { apiKey: null }),
        ...(authToken ? { authToken } : {}),
      });
      const userContext = await assembleUserContext();

      const message = await client.messages.create(
        {
          model: "claude-sonnet-4-20250514",
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `User's current data:\n${userContext}\n\nQuestion: ${trimmedQuery}`,
            },
          ],
        },
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      const textBlock = message.content.find((b) => b.type === "text");
      const responseText = textBlock?.text ?? "";

      // Determine confidence from response content
      let confidence = "mod";
      if (responseText.includes("🟢")) confidence = "high";
      else if (responseText.includes("🔴")) confidence = "low";

      return {
        response: responseText,
        confidence,
        fallback: false,
      };
    })();

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 3000);
    });

    const result = await Promise.race([claudePromise, timeoutPromise]);

    if (result) {
      // Claude responded in time
      const latency = Date.now() - startTime;
      console.error(
        `[impact/analyze] Claude success | auth=${authMethod} | query="${trimmedQuery}" | latency=${latency}ms | fallback=false`
      );
      return NextResponse.json(result);
    }

    // ── Timeout: fall back to local parser ──────────────────────────────
    controller.abort();
    fallbackTriggered = true;
    const latency = Date.now() - startTime;
    console.error(
      `[impact/analyze] Claude timeout — using local fallback | query="${trimmedQuery}" | latency=${latency}ms | fallback=true`
    );

    if (localResult) {
      return NextResponse.json({
        response: localResult.summary,
        confidence: localResult.confidence,
        fallback: true,
        mechanismChain: localResult.mechanismChain,
        relatableEquiv: localResult.relatableEquiv,
        trajectoryShift: localResult.trajectoryShift,
        category: localResult.category,
      });
    }

    // Both Claude and local parser failed
    return NextResponse.json(
      {
        error: "Unable to analyze query — Claude timed out and no local handler matched",
        fallback: true,
      },
      { status: 504 }
    );
  } catch (err) {
    const latency = Date.now() - startTime;
    console.error(
      `[impact/analyze] Error | latency=${latency}ms | fallback=${fallbackTriggered} |`,
      err
    );

    return NextResponse.json(
      { error: "Internal server error", fallback: true },
      { status: 500 }
    );
  }
}
