// ─── POST /api/impact/analyze ────────────────────────────────────────────────
// Handles compound "What if?" queries via Claude with personalized context.
// Uses Claude Agent SDK (spawns claude CLI binary) with Claude Max OAuth.
// Falls back to local keyword parser on timeout or error.

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { prepareClaudeCredentials } from "@/lib/claude/credentials";
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

EVIDENCE TABLES (these are your boundaries — do not extrapolate beyond them):

ALCOHOL:
| Tier | Drinks | Fat Ox Suppression | MPS Impact | Recovery | Confidence |
| Light | 1-2 | 20-40%, 4-6h | Likely minimal | ~12h | 🟡 |
| Moderate | 3-5 | 50-70%, 6-8h | 10-20% ↓ | 24-36h | 🟡 |
| Heavy | 6+ | 73-79%, 8h+ | 24-37% ↓ (Parr et al.) | 48-72h | 🟢 |
NOTE: There is NO granularity above 6 drinks. 10 drinks and 20 drinks are the same tier. Do not invent sub-tiers.

SLEEP:
| Tier | Hours | Fat:Muscle Ratio | Hunger ↑ | MPS | Confidence |
| Optimal | 8+ | 50-60% fat | Baseline | Baseline | 🟢 |
| Adequate | 7-8 | 40-50% fat | +100-200 kcal | Modest ↓ | 🟡 |
| Poor | 5.5-7 | 20-35% fat | +300-450 kcal | -18% | 🟢 |
| Severe | <5.5 | 10-25% fat | +400-600 kcal | Significant ↓ | 🟡 |

EXERCISE:
| Type | kcal/min (range) | EPOC | MPS Boost | Confidence |
| Strength | 5.2-7.8 | 30-60 kcal | 24-36h elevation | 🟢 |
| Running | 8-12 | 15-30 kcal | Minimal | 🟢 |

DIET (Vibes scale):
| Score | Name | kcal Delta | Confidence |
| 1 | Dumpster Fire | +800 to +1200 | 🟢 |
| 2 | Meh | +200 to +500 | 🟢 |
| 3 | Cruise Control | -200 to +200 | 🟢 |
| 4 | Dialed In | -500 to -300 | 🟢 |
| 5 | Sniper Mode | -700 to -500 | 🟢 |

SINGLE MEAL DEVIATION:
| Scenario | Actual Fat Gain | Scale Impact | Recovery |
| +500 kcal | 0.05-0.1 lbs | +0.5-1.5 lbs (water/glycogen) | Negligible if isolated |
| +1000 kcal | 0.15-0.25 lbs | +1-3 lbs | 2-3 clean days |
| Weekend blowout +2000 kcal | 0.3-0.5 lbs | +2-5 lbs | Can erase weekly deficit |

CASCADING EFFECTS (alcohol → sleep → diet):
- 3-5 drinks degrades effective sleep by 1.0-1.5h even if duration is the same
- 6+ drinks degrades effective sleep by 1.5-2.0h
- Poor sleep (<7h effective) increases next-day hunger, shifting diet score down ~1 tier per 250 kcal surplus
- Exercise is independent of the cascade

Rules you MUST follow on every response:

Rule 1: Always give RANGES, never point estimates. Use [low, high] bounds for any numerical claim.
Rule 2: Mark every claim with a confidence tier: 🟢 Well-established / 🟡 Evidence-supported / 🔴 Plausible but uncertain.
Rule 3: Frame positively — emphasize recovery paths, not blame. "Letting loose" is valid input.
Rule 4: Be specific about mechanisms — reference fat oxidation, muscle protein synthesis (MPS), sleep architecture, glycogen, cortisol, ghrelin/leptin when relevant.
Rule 5: Keep responses under 150 words.
Rule 6: Reference the user's actual data when relevant — their current weight, pace, recent patterns.
Rule 7: Engine-constrained — do not invent physiological claims beyond the evidence tables above. If uncertain, say so.
Rule 8: No calorie counting language — use diet quality tiers instead of calorie numbers when framing advice.
Rule 9: NEVER extrapolate beyond the evidence tables. If asked to compare scenarios that map to the same tier (e.g., "10 drinks vs 20 drinks"), say explicitly: "Both map to the 6+ heavy tier. The research doesn't distinguish between them." Do NOT invent graduated numbers to fill gaps. Mark any extrapolation beyond table boundaries as 🔴.
Rule 10: Respond in conversational prose, not structured reports. No markdown headers. No bullet-heavy layouts. Write like you're explaining to a friend. Short paragraphs. Natural flow. Confidence tiers inline, not as a structured legend.`;

// ─── Response Validation ─────────────────────────────────────────────────────

function validateResponse(response: string): string[] {
  const warnings: string[] = [];

  // Check for point-estimate weight predictions
  if (/you('ll| will) (weigh|be at) \d/i.test(response)) {
    warnings.push("Response contains weight prediction");
  }

  // Check that confidence tiers are present
  if (!/🟢|🟡|🔴/.test(response)) {
    warnings.push("Response missing confidence tiers");
  }

  // Check for extrapolation beyond alcohol tiers (multiple specific numbers above 6)
  const highDrinkNumbers = [...response.matchAll(/(\d+)\s*drink/g)]
    .map((m) => parseInt(m[1]))
    .filter((n) => n > 6);
  if (highDrinkNumbers.length > 1 && new Set(highDrinkNumbers).size > 1) {
    warnings.push("Response may contain extrapolated alcohol sub-tiers above 6 drinks");
  }

  // Check for backward-looking blame language
  if (/you ruined|you blew it|you failed|that was a mistake|you shouldn't have/i.test(response)) {
    warnings.push("Response contains blame language");
  }

  return warnings;
}

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

    const creds = await prepareClaudeCredentials();

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

      // Pre-compute engine analysis as a constraint for Claude
      const engineConstraint = localResult
        ? `\nENGINE PRE-ANALYSIS (you must not contradict this):\n${localResult.summary}\nConfidence: ${localResult.confidence}\nCategory: ${localResult.category}\n`
        : `\nENGINE PRE-ANALYSIS: No direct match in local engine. Any physiological claims must reference the evidence tables above. Mark extrapolations beyond table boundaries as 🔴.\n`;

      const claudeResult = await Promise.race([
        (async (): Promise<string | null> => {
          try {
            const userContext = await assembleUserContext();
            const sdk = query({
              prompt: `User's current data:\n${userContext}\n${engineConstraint}\nQuestion: ${trimmedQuery}`,
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

        // Post-processing validation
        const warnings = validateResponse(claudeResult);
        let finalResponse = claudeResult;
        if (warnings.length > 0) {
          console.error(
            `[impact/analyze] Validation warnings: ${warnings.join("; ")}`
          );
          // If local engine had a result, prefer it over a suspect Claude response
          if (localResult && warnings.some(w => w.includes("extrapolated") || w.includes("prediction"))) {
            console.error("[impact/analyze] Falling back to local engine due to validation failure");
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
          finalResponse += "\n\n⚠️ This response may contain claims beyond our evidence base.";
        }

        console.error(
          `[impact/analyze] Agent SDK success | query="${trimmedQuery}" | latency=${Date.now() - startTime}ms`
        );
        return NextResponse.json({ response: finalResponse, confidence, fallback: false });
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
