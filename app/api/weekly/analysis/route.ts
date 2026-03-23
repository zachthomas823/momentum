// ─── Momentum analysis via Claude Agent SDK ─────────────────────────────────
// Generates a "coach between rounds" debrief using the user's actual data.
// Claude pulls 30 days via MCP tools, then writes a focused analysis.
// Cached daily — regenerate with ?refresh=true.

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { prepareClaudeCredentials } from "@/lib/claude/credentials";
import { createFitnessServer } from "@/lib/claude/fitness-tools";

const ANALYSIS_PROMPT = `You are a body composition coach doing a between-rounds debrief. You have access to the user's fitness data tools — use them to pull the last 30 days of data and the current weight trend before writing your analysis.

STRUCTURE your analysis in exactly this order:

1. WHAT MOVED THE NEEDLE — Name the 2-3 specific decisions or patterns from recent days that had the most impact on trajectory. Be concrete: "3 strength sessions this week" not "good exercise habits." Reference actual dates and data points.

2. WHAT'S QUIETLY WORKING — One thing the user might not notice that's helping. Sleep consistency, step count, dry streaks — the unglamorous stuff that compounds.

3. THE ONE THING — The single highest-leverage change or continuation for the next week. Not a list of improvements. One thing. Make it specific and actionable.

4. MOMENTUM READ — One sentence. Is momentum building, holding, or fading? Where does the user stand relative to their targets?

RULES:
- Pull the last 30 days of data but weight your analysis toward the most recent 7-10 days. Mention older events only if they're significant (a plateau breaking, a pattern shifting).
- Use actual numbers from the data. "Sleep averaging 8.1h" not "good sleep."
- No markdown headers. No bullet lists. Write in short, punchy paragraphs.
- Don't moralize about bad days. If they drank or skipped the gym, frame it in terms of what it cost and how fast they recovered — not whether it was right or wrong.
- Confidence tiers only if making a physiological claim. This is mostly observational, not predictive.
- Keep it under 200 words. Every sentence should earn its place.
- End with momentum, not advice.

FRAMING EXAMPLES:
✓ "The Friday drinks barely registered — you kept it to 3 and recovered by Monday."
✓ "No diet logging since Wednesday. When you stop logging, the trajectory flattens — you saw this in February."
✓ "Momentum: solid. Keep the gym cadence and you're ahead of pace into April."
✗ "You should try to drink less on weekends."
✗ "Great job this week! Keep up the good work!"`;

import { todayLocal } from "@/lib/date-utils";

// Simple daily cache (survives within a single serverless instance)
const cache = new Map<string, { analysis: string; generatedAt: string }>();

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";
  const today = todayLocal();

  // Return cached if available and not refreshing
  if (!refresh && cache.has(today)) {
    return NextResponse.json(cache.get(today));
  }

  const creds = await prepareClaudeCredentials();
  if (!creds) {
    return NextResponse.json(
      { error: "No Claude credentials available" },
      { status: 503 }
    );
  }

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

  const fitnessServer = createFitnessServer();

  try {
    const result = await Promise.race([
      (async (): Promise<string | null> => {
        try {
          const sdk = query({
            prompt: "Generate my momentum analysis for this week.",
            options: {
              systemPrompt: ANALYSIS_PROMPT,
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
              env: { ...baseEnv, HOME: creds.home },
            },
          });

          let responseText = "";
          for await (const msg of sdk) {
            if (msg.type === "result") {
              if (msg.subtype === "success") responseText = msg.result;
              break;
            }
            if (msg.type === "assistant" && !msg.error) {
              const textBlock = msg.message.content.find((b) => b.type === "text");
              if (textBlock?.type === "text") responseText = textBlock.text;
            }
          }
          return responseText || null;
        } catch (e) {
          console.error("[weekly/analysis] Agent SDK error:", e);
          return null;
        }
      })(),
      new Promise<null>((resolve) =>
        setTimeout(() => { controller.abort(); resolve(null); }, 55000)
      ),
    ]);

    if (result) {
      const entry = {
        analysis: result,
        generatedAt: new Date().toISOString(),
      };
      cache.set(today, entry);

      console.error(
        `[weekly/analysis] Generated | latency=${Date.now() - startTime}ms`
      );
      return NextResponse.json(entry);
    }

    return NextResponse.json(
      { error: "Analysis generation timed out" },
      { status: 504 }
    );
  } catch (err) {
    console.error("[weekly/analysis] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate analysis" },
      { status: 500 }
    );
  }
}
