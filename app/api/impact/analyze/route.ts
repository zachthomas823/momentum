// ─── POST /api/impact/analyze ────────────────────────────────────────────────
// Handles "What if?" and contextual fitness queries via Claude Agent SDK.
// Claude has access to fitness data tools (MCP server) and can query the
// user's actual logged data in a multi-turn conversation before answering.
// Falls back to local keyword parser on timeout or error.

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { prepareClaudeCredentials } from "@/lib/claude/credentials";
import { createFitnessServer } from "@/lib/claude/fitness-tools";
import { buildSystemPrompt } from "@/lib/claude/prompts";
import { parseQuery } from "@/lib/engine/keywords";
import { verifySession } from "@/lib/auth/dal";
import { getUserProfile, getUserMilestones } from "@/lib/db/queries";

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

    // Query DB for profile to personalize the system prompt
    let profileName = "User";
    let profileAge = 28;
    let profilePersona: string = "coach";
    let userMilestones: Awaited<ReturnType<typeof getUserMilestones>> = [];
    try {
      const session = await verifySession();
      const userId = session.userId as number;
      const profile = await getUserProfile(userId);
      if (profile) {
        profileName = profile.name ?? "User";
        profileAge = profile.age ?? 28;
        profilePersona = profile.aiPersona ?? "coach";
      }
      userMilestones = await getUserMilestones(userId);
    } catch (err) {
      // Auth or DB failure — use defaults, don't block the request
      console.error("[impact/analyze] Profile query failed, using defaults:", err);
    }

    const systemPrompt = buildSystemPrompt({
      persona: profilePersona as 'coach' | 'buddy' | 'analyst',
      name: profileName,
      age: profileAge,
      milestones: userMilestones,
      entryPoint: 'impact',
    });

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
                systemPrompt: systemPrompt,
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
        return NextResponse.json({ response: finalResponse, confidence, fallback: false, persona: profilePersona });
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
