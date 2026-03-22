// ─── Photo analysis via Claude vision ────────────────────────────────────────
// Compares current progress photo with the most recent previous photo of the
// same type using Claude's vision capabilities.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { photos } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPreviousPhoto, updatePhotoAnalysis } from "@/lib/db/queries";
import { query } from "@anthropic-ai/claude-agent-sdk";
import fs from "fs";
import path from "path";
import os from "os";

const PHOTO_SYSTEM_PROMPT = `You are a body composition visual analyst for a fitness tracker app. The user is targeting a wedding on Sept 5, 2026.

When comparing two progress photos:
- Note changes in shoulder-to-waist ratio
- Assess arm definition and muscle visibility
- Comment on midsection/waist changes
- Note posture improvements
- Reference the weight/BF% data alongside visual observations

Rules:
- Use confidence tiers: 🟢 Well-established / 🟡 Evidence-supported / 🔴 Plausible
- Frame positively — emphasize progress, not criticism
- Keep response under 200 words
- If only one photo (no comparison), provide a baseline assessment`;

function prepareCredentials(): { home: string } | null {
  const credsJson = process.env.CLAUDE_CREDENTIALS_JSON;
  if (credsJson) {
    try {
      const claudeDir = "/tmp/.claude";
      if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, ".credentials.json"), credsJson, "utf8");
      return { home: "/tmp" };
    } catch {
      return null;
    }
  }
  const defaultHome = os.homedir();
  const localCreds = path.join(defaultHome, ".claude", ".credentials.json");
  if (fs.existsSync(localCreds)) return { home: defaultHome };
  return null;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json();
    const photoId = body?.photoId;

    if (!photoId || typeof photoId !== "number") {
      return NextResponse.json(
        { error: "photoId (number) is required" },
        { status: 400 }
      );
    }

    // Fetch the current photo
    const db = getDb();
    const rows = await db.select().from(photos).where(eq(photos.id, photoId));
    const currentPhoto = rows[0];

    if (!currentPhoto) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    // Find previous photo of the same type
    const prevPhoto = await getPreviousPhoto(currentPhoto.date, currentPhoto.type);

    // Build analysis prompt
    let promptText = `Progress photo analysis for ${currentPhoto.date} (${currentPhoto.type} view).\n`;
    promptText += `Current: ${currentPhoto.weightLbs ?? "unknown"} lbs, ${currentPhoto.bodyFatPct ?? "unknown"}% BF\n`;
    promptText += `Photo URL: ${currentPhoto.blobUrl}\n`;

    if (prevPhoto) {
      promptText += `\nPrevious photo from ${prevPhoto.date} (${prevPhoto.type} view).\n`;
      promptText += `Previous: ${prevPhoto.weightLbs ?? "unknown"} lbs, ${prevPhoto.bodyFatPct ?? "unknown"}% BF\n`;
      promptText += `Previous photo URL: ${prevPhoto.blobUrl}\n`;
      promptText += `\nCompare these two progress photos and note any visible changes.`;
    } else {
      promptText += `\nNo previous photo available. Provide a baseline assessment.`;
    }

    // Use Agent SDK (same pattern as impact/analyze)
    const creds = prepareCredentials();
    if (!creds) {
      return NextResponse.json(
        { error: "No Claude credentials available for photo analysis" },
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

    const analysisResult = await Promise.race([
      (async (): Promise<string | null> => {
        try {
          const sdk = query({
            prompt: promptText,
            options: {
              systemPrompt: PHOTO_SYSTEM_PROMPT,
              maxTurns: 1,
              abortController: controller,
              permissionMode: "dontAsk",
              pathToClaudeCodeExecutable: claudeBinPath,
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
        setTimeout(() => { controller.abort(); resolve(null); }, 30000)
      ),
    ]);

    if (!analysisResult) {
      return NextResponse.json(
        { error: "Claude analysis timed out or failed" },
        { status: 504 }
      );
    }

    // Save analysis to DB
    const analysis = {
      text: analysisResult,
      analyzedAt: new Date().toISOString(),
      comparedWith: prevPhoto?.id ?? null,
    };
    await updatePhotoAnalysis(photoId, analysis);

    console.error(
      `[photos/analyze] Success | photoId=${photoId} | latency=${Date.now() - startTime}ms`
    );

    return NextResponse.json({ analysis: analysisResult, comparedWith: prevPhoto?.id ?? null });
  } catch (err) {
    console.error("[photos/analyze] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
