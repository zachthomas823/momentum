// ─── Photo analysis via Claude ───────────────────────────────────────────────
// Compares progress between two photo dates using fitness data.
// Claude can't directly view private blob images, so it analyzes the
// metrics (weight, BF%, exercise, sleep) between the two dates instead.

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getDb } from "@/lib/db";
import { photos } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPreviousPhoto, updatePhotoAnalysis } from "@/lib/db/queries";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { prepareClaudeCredentials } from "@/lib/claude/credentials";
import { createFitnessServer } from "@/lib/claude/fitness-tools";

const PHOTO_SYSTEM_PROMPT = `You are a body composition progress analyst for a fitness tracker. The user has taken progress photos on two dates. You can't see the photos directly, but you have access to their fitness data tools — use them to compare what changed between the two dates.

Use get_recent_days to pull data covering both photo dates. Look at:
- Weight and body fat % change between the dates
- Exercise patterns (strength sessions, steps)
- Sleep quality and consistency
- Diet logging and scores
- Alcohol patterns

Write a progress report that:
- Compares the measurable data between the two dates
- Notes which behaviors drove the changes
- Highlights what's improving and what could shift faster
- Keeps the tone of a coach reviewing check-in photos with an athlete

Keep it under 150 words. Use confidence tiers (🟢/🟡/🔴) for physiological claims. Frame forward, not backward.`;

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const photoId = body?.photoId;

    if (!photoId || typeof photoId !== "number") {
      return NextResponse.json({ error: "photoId (number) is required" }, { status: 400 });
    }

    const db = getDb();
    const rows = await db.select().from(photos).where(eq(photos.id, photoId));
    const currentPhoto = rows[0];
    if (!currentPhoto) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    const prevPhoto = await getPreviousPhoto(currentPhoto.date, currentPhoto.type);

    let promptText = `Progress check-in for ${currentPhoto.date} (${currentPhoto.type} view).\n`;
    promptText += `Current metrics: ${currentPhoto.weightLbs ?? "unknown"} lbs, ${currentPhoto.bodyFatPct ?? "unknown"}% BF.\n`;

    if (prevPhoto) {
      promptText += `Previous check-in: ${prevPhoto.date} — ${prevPhoto.weightLbs ?? "unknown"} lbs, ${prevPhoto.bodyFatPct ?? "unknown"}% BF.\n`;
      promptText += `Use the fitness data tools to compare what happened between ${prevPhoto.date} and ${currentPhoto.date}. What drove the changes?`;
    } else {
      promptText += `This is the first check-in. Use the fitness data tools to give a baseline assessment of current patterns and trajectory.`;
    }

    const creds = await prepareClaudeCredentials();
    if (!creds) {
      return NextResponse.json({ error: "No Claude credentials available" }, { status: 503 });
    }

    const controller = new AbortController();
    const claudeBinPath = path.join(process.cwd(), "node_modules/@anthropic-ai/claude-code/cli.js");
    const { ANTHROPIC_AUTH_TOKEN: _a, ANTHROPIC_API_KEY: _b, ...baseEnv } = process.env as Record<string, string>;
    const fitnessServer = createFitnessServer();

    const analysisResult = await Promise.race([
      (async (): Promise<string | null> => {
        try {
          const sdk = query({
            prompt: promptText,
            options: {
              systemPrompt: PHOTO_SYSTEM_PROMPT,
              maxTurns: 5,
              abortController: controller,
              permissionMode: "dontAsk",
              pathToClaudeCodeExecutable: claudeBinPath,
              mcpServers: { fitness: fitnessServer },
              allowedTools: ["mcp__fitness__*"],
              disallowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Agent", "WebFetch", "WebSearch"],
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
          console.error("[photos/analyze] Agent SDK error:", e);
          return null;
        }
      })(),
      new Promise<null>((resolve) =>
        setTimeout(() => { controller.abort(); resolve(null); }, 55000)
      ),
    ]);

    if (!analysisResult) {
      return NextResponse.json({ error: "Claude analysis timed out or failed" }, { status: 504 });
    }

    const analysis = {
      text: analysisResult,
      analyzedAt: new Date().toISOString(),
      comparedWith: prevPhoto?.id ?? null,
    };
    await updatePhotoAnalysis(photoId, analysis);

    console.error(`[photos/analyze] Success | photoId=${photoId} | latency=${Date.now() - startTime}ms`);
    return NextResponse.json({ analysis: analysisResult, comparedWith: prevPhoto?.id ?? null });
  } catch (err) {
    console.error("[photos/analyze] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
