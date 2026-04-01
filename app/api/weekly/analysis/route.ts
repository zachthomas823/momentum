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
import { buildSystemPrompt } from "@/lib/claude/prompts";
import { verifySession } from "@/lib/auth/dal";
import { getUserProfile, getUserMilestones } from "@/lib/db/queries";

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

  // Auth + profile for persona-aware prompts (fail gracefully to defaults)
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
    console.error("[weekly/analysis] Profile query failed, using defaults:", err);
  }

  const analysisPrompt = buildSystemPrompt({
    persona: profilePersona as 'coach' | 'buddy' | 'analyst',
    name: profileName,
    age: profileAge,
    milestones: userMilestones,
    entryPoint: 'weekly',
  });

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
              systemPrompt: analysisPrompt,
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
      // Try to parse as structured JSON, fall back to raw text
      let parsed;
      try {
        // Strip markdown code fences if Claude wrapped it
        const cleaned = result.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        // If JSON parsing fails, return as raw text for backward compatibility
        parsed = { analysis: result };
      }

      const entry = {
        ...parsed,
        persona: profilePersona,
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
