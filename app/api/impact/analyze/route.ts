// ─── POST /api/impact/analyze ────────────────────────────────────────────────
// Handles compound "What if?" queries via Claude with personalized context.
// Uses Claude Agent SDK (spawns claude CLI binary) with credentials from:
//   - CLAUDE_CREDENTIALS_JSON env var (full JSON from ~/.claude/.credentials.json)
//   - Falls back to default credentials file (local dev)
// Falls back to local keyword parser on timeout or error.

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { parseQuery } from "@/lib/engine/keywords";
import {
  getLast14Days,
  getLatestWeight,
} from "@/lib/db/queries";
import {
  tdeePipeline,
  derivedPace,
  checkMilestones,
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

// ─── Credentials setup ───────────────────────────────────────────────────────
// Returns the HOME dir to use for the subprocess. If CLAUDE_CREDENTIALS_JSON
// is set, writes the credentials file to /tmp so the CLI can find it.

function prepareCredentials(): { home: string } | null {
  const credsJson = process.env.CLAUDE_CREDENTIALS_JSON;

  if (credsJson) {
    // Vercel / production: write credentials JSON to /tmp/.claude/.credentials.json
    try {
      const claudeDir = "/tmp/.claude";
      if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, ".credentials.json"), credsJson, "utf8");
      return { home: "/tmp" };
    } catch (e) {
      console.error("[impact/analyze] Failed to write credentials to /tmp:", e);
      return null;
    }
  }

  // Local dev: use default HOME — CLI will find ~/.claude/.credentials.json naturally
  const defaultHome = os.homedir();
  const localCreds = path.join(defaultHome, ".claude", ".credentials.json");
  if (fs.existsSync(localCreds)) {
    return { home: defaultHome };
  }

  return null;
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const userQuery = body?.query;

    if (!userQuery || typeof userQuery !== "string" || userQuery.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or empty 'query' field" },
        { status: 400 }
      );
    }

    const trimmedQuery = userQuery.trim();
    const localResult = parseQuery(trimmedQuery);

    const creds = prepareCredentials();

    if (creds) {
      const controller = new AbortController();

      const claudeBinPath = path.join(
        process.cwd(),
        "node_modules/@anthropic-ai/claude-code/cli.js"
      );

      // Strip auth token overrides — let CLI use credentials file instead
      const {
        ANTHROPIC_AUTH_TOKEN: _authToken,
        ANTHROPIC_API_KEY: _apiKey,
        ...baseEnv
      } = process.env as Record<string, string>;

      const claudeResult = await Promise.race([
        (async (): Promise<string | null> => {
          try {
            const userContext = await assembleUserContext();
            const sdk = query({
              prompt: `User's current data:\n${userContext}\n\nQuestion: ${trimmedQuery}`,
              options: {
                systemPrompt: SYSTEM_PROMPT,
                maxTurns: 1,
                abortController: controller,
                permissionMode: "dontAsk",
                pathToClaudeCodeExecutable: claudeBinPath,
                env: {
                  ...baseEnv,
                  HOME: creds.home,
                },
              },
            });

            let responseText = "";
            for await (const msg of sdk) {
              if (msg.type === "result") {
                if (msg.subtype === "success") {
                  responseText = msg.result;
                } else {
                  console.error(
                    `[impact/analyze] Agent SDK result error | subtype=${msg.subtype} | errors=${JSON.stringify(msg.errors)}`
                  );
                }
                break;
              }
              if (msg.type === "assistant") {
                if (msg.error) {
                  console.error(`[impact/analyze] Assistant message error: ${msg.error}`);
                } else {
                  const textBlock = msg.message.content.find((b) => b.type === "text");
                  if (textBlock?.type === "text") responseText = textBlock.text;
                }
              }
            }
            return responseText || null;
          } catch (e) {
            console.error("[impact/analyze] Agent SDK error:", e);
            return null;
          }
        })(),
        new Promise<null>((resolve) =>
          setTimeout(() => { controller.abort(); resolve(null); }, 15000)
        ),
      ]);

      if (claudeResult) {
        let confidence = "mod";
        if (claudeResult.includes("🟢")) confidence = "high";
        else if (claudeResult.includes("🔴")) confidence = "low";

        console.error(
          `[impact/analyze] Agent SDK success | query="${trimmedQuery}" | latency=${Date.now() - startTime}ms`
        );
        return NextResponse.json({ response: claudeResult, confidence, fallback: false });
      }

      console.error(
        `[impact/analyze] Agent SDK failed/timeout | query="${trimmedQuery}" | latency=${Date.now() - startTime}ms`
      );
    } else {
      console.error(
        `[impact/analyze] No credentials available — using local fallback | latency=${Date.now() - startTime}ms`
      );
    }

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
      { error: "Unable to analyze query — Claude unavailable and no local handler matched", fallback: true },
      { status: 503 }
    );
  } catch (err) {
    console.error(
      `[impact/analyze] Error | latency=${Date.now() - startTime}ms |`,
      err
    );
    return NextResponse.json(
      { error: "Internal server error", fallback: true },
      { status: 500 }
    );
  }
}
