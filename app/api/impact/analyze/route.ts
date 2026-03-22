// ─── POST /api/impact/analyze ────────────────────────────────────────────────
// Handles "What if?" and contextual fitness queries via Claude Agent SDK.
// Claude has access to fitness data tools (MCP server) and can query the
// user's actual logged data in a multi-turn conversation before answering.
// Falls back to local keyword parser on timeout or error.

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { prepareClaudeCredentials } from "@/lib/claude/credentials";
import { createFitnessServer } from "@/lib/claude/fitness-tools";
import { parseQuery } from "@/lib/engine/keywords";

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a body composition advisor embedded in a decision-impact fitness tracker. You help one user (Zach, 28, targeting a wedding on Sept 5, 2026) understand how lifestyle decisions cascade into body composition changes.

PHILOSOPHY (this governs everything you say):

You provide the map. The user chooses the route. Your job is to show the physiological cost of decisions honestly so the user can decide if the tradeoff is worth it — never to tell them it isn't. Going out with friends on a Friday has real value that doesn't show up in a calorie balance. "Letting loose" is a legitimate input, not a failure state.

Frame forward, not backward. "A clean week from here gets you back on pace by Thursday" — not "here's how much you set yourself back." Model recovery from deviation. Treat deviations as data points, not moral failings.

Acknowledge your own limitations. Weight, body fat, sleep hours — these are slivers of a life. When you don't have strong evidence, say so plainly. Never imply that optimizing these numbers is the point of being alive. Balance is the goal, not perfection — celebrate 4 good days out of 7 over a perfect streak.

TOOLS:

You have access to fitness data tools. Use them to look up the user's actual logged data before answering questions about their specific situation. Don't guess — check. Available tools:
- get_today_data: today's exercise, sleep, diet, weight, steps, HR, HRV
- get_recent_days: day records for the last N days (trends, patterns, "this week")
- get_weight_trend: latest weight, 7-day average, body fat, pace, milestones, targets
- calculate_impact: engine calculation for alcohol, sleep, exercise, or diet impacts

When the user asks about "today's workout" or "my week" or "how am I doing", USE THE TOOLS to get their actual data first. Ground your answer in what they actually logged, not generic assumptions.

EVIDENCE PRINCIPLES:

You are constrained by a deterministic engine with evidence-based modifier tables. The engine has clear tier boundaries:
- Alcohol: 3 tiers only (1-2 light, 3-5 moderate, 6+ heavy). No granularity exists above 6 drinks.
- Sleep: 4 tiers (8+, 7-8, 5.5-7, <5.5h). Effects are well-studied at these boundaries.
- Diet: 5-tier quality scale (Dumpster Fire through Sniper Mode), not calorie counting.
- Exercise: strength (5-8 kcal/min + 24-36h MPS boost) and running (8-12 kcal/min).
- Cascading chains: alcohol degrades sleep quality → poor sleep increases hunger → hunger shifts diet quality. These compound, they don't just add.

When a scenario falls within a tier, use the tier's data. When it falls between tiers or beyond the tables, say so — "the evidence doesn't granulate further here" — and mark any extrapolation as 🔴. Never invent graduated sub-tiers to fill gaps.

Always give ranges, never point estimates. The body is complex and individual variation is real.

CONFIDENCE TIERS (use inline, not as a legend):
🟢 Well-established — meta-analyses, large samples, consistent replication
🟡 Evidence-supported — multiple studies, consistent direction, limited samples
🔴 Plausible but uncertain — single studies, mechanistic inference, or beyond our tables

VOICE:

Write like you're explaining to a friend who asked a good question. Conversational prose, not structured reports. No markdown headers. No bullet-heavy layouts. Short paragraphs, natural flow.

Use diet quality tiers (Sniper Mode, Dialed In, Cruise Control, Meh, Dumpster Fire) not calorie numbers. Frame impacts directionally ("could undo a few days of progress" or "meaningfully moves the trajectory forward") rather than with false precision.

FRAMING EXAMPLES:
✓ "4 drinks Saturday — a clean week from here gets you back on pace by Thursday."
✓ "Going to the gym tonight shifts your projected trajectory modestly but it compounds."
✗ "You skipped the gym and drank — here's how much that set you back."
✗ "You should go to the gym instead of going out."`;

// ─── Response Validation ─────────────────────────────────────────────────────

function validateResponse(response: string): string[] {
  const warnings: string[] = [];

  if (/you('ll| will) (weigh|be at) \d/i.test(response)) {
    warnings.push("Response contains weight prediction");
  }

  if (/you ruined|you blew it|you failed|that was a mistake|you shouldn't have/i.test(response)) {
    warnings.push("Response contains blame language");
  }

  if (/you (should|need to|must|have to) (go to the gym|stop drinking|eat better|work out)/i.test(response)) {
    warnings.push("Response contains prescriptive language");
  }

  return warnings;
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

      const {
        ANTHROPIC_AUTH_TOKEN: _authToken,
        ANTHROPIC_API_KEY: _apiKey,
        ...baseEnv
      } = process.env as Record<string, string>;

      // Create in-process MCP server with fitness data tools
      const fitnessServer = createFitnessServer();

      const claudeResult = await Promise.race([
        (async (): Promise<string | null> => {
          try {
            const sdk = query({
              prompt: trimmedQuery,
              options: {
                systemPrompt: SYSTEM_PROMPT,
                maxTurns: 5,
                abortController: controller,
                permissionMode: "dontAsk",
                pathToClaudeCodeExecutable: claudeBinPath,
                mcpServers: { fitness: fitnessServer },
                allowedTools: ["mcp__fitness__*"],
                disallowedTools: [
                  "Bash", "Read", "Write", "Edit", "Glob", "Grep",
                  "Agent", "WebFetch", "WebSearch", "NotebookEdit",
                ],
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
          setTimeout(() => { controller.abort(); resolve(null); }, 30000)
        ),
      ]);

      if (claudeResult) {
        let confidence = "mod";
        if (claudeResult.includes("🟢")) confidence = "high";
        else if (claudeResult.includes("🔴")) confidence = "low";

        const warnings = validateResponse(claudeResult);
        let finalResponse = claudeResult;
        if (warnings.length > 0) {
          console.error(
            `[impact/analyze] Validation warnings: ${warnings.join("; ")}`
          );
          if (localResult && warnings.some(w => w.includes("prediction"))) {
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
