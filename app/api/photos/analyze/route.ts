// ─── Photo analysis via Claude vision ────────────────────────────────────────
// Fetches progress photos from Vercel Blob, converts to base64, and passes
// them as images to the Agent SDK via a generator prompt. Claude can actually
// SEE the photos and compare them visually.

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getDb } from "@/lib/db";
import { photos } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPreviousPhoto, updatePhotoAnalysis } from "@/lib/db/queries";
import { get } from "@vercel/blob";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { prepareClaudeCredentials } from "@/lib/claude/credentials";
import { createFitnessServer } from "@/lib/claude/fitness-tools";

const PHOTO_SYSTEM_PROMPT = `You are a body composition coach reviewing progress photos. You can see the actual photos the user has taken.

When comparing two photos:
- Focus on visible changes: shoulder-to-waist ratio, arm definition, midsection, face/jawline, posture
- Be specific about what you observe — "slightly more definition in the lateral deltoid" not "looking more muscular"
- If lighting or angle differences make comparison unreliable, say so honestly
- Don't fabricate progress. If 2 weeks and 2 lbs isn't visually apparent, that's normal — say so
- Reference the weight/BF% data alongside visual observations
- The scale data tells the real story; photos add context but aren't the primary metric

You also have access to fitness data tools. Use them to check what training, sleep, and diet patterns happened between the two photo dates.

Keep it under 200 words. Use confidence tiers (🟢/🟡/🔴) only for physiological claims. Write like a coach reviewing check-in photos with an athlete — direct, honest, encouraging.`;

/** Fetch a blob and return its base64 data. */
async function blobToBase64(blobUrl: string): Promise<string | null> {
  try {
    const result = await get(blobUrl, { access: "private" });
    if (!result || !result.stream) return null;
    const chunks: Uint8Array[] = [];
    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return Buffer.from(combined).toString("base64");
  } catch (e) {
    console.error("[photos/analyze] Failed to fetch blob:", e);
    return null;
  }
}

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

    // Fetch photo blobs and convert to base64
    const currentB64 = await blobToBase64(currentPhoto.blobUrl);
    if (!currentB64) {
      return NextResponse.json({ error: "Failed to fetch current photo" }, { status: 500 });
    }

    const prevB64 = prevPhoto ? await blobToBase64(prevPhoto.blobUrl) : null;

    const creds = await prepareClaudeCredentials();
    if (!creds) {
      return NextResponse.json({ error: "No Claude credentials available" }, { status: 503 });
    }

    const controller = new AbortController();
    const claudeBinPath = path.join(process.cwd(), "node_modules/@anthropic-ai/claude-code/cli.js");
    const { ANTHROPIC_AUTH_TOKEN: _a, ANTHROPIC_API_KEY: _b, ...baseEnv } = process.env as Record<string, string>;
    const fitnessServer = createFitnessServer();

    // Build multimodal prompt with images
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contentBlocks: any[] = [];

    if (prevB64 && prevPhoto) {
      contentBlocks.push({
        type: "text",
        text: `Compare these two progress photos.\n\nPhoto 1 (previous): ${prevPhoto.date} — ${prevPhoto.weightLbs ?? "unknown"} lbs, ${prevPhoto.bodyFatPct ?? "unknown"}% BF\nPhoto 2 (current): ${currentPhoto.date} — ${currentPhoto.weightLbs ?? "unknown"} lbs, ${currentPhoto.bodyFatPct ?? "unknown"}% BF\nWeight change: ${((prevPhoto.weightLbs ?? 0) - (currentPhoto.weightLbs ?? 0)).toFixed(1)} lbs\n\nUse the fitness data tools to check what happened between these dates. Then describe what you see in the photos.`,
      });
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: prevB64 },
      });
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: currentB64 },
      });
    } else {
      contentBlocks.push({
        type: "text",
        text: `This is the first progress photo check-in (${currentPhoto.date}, ${currentPhoto.type} view). ${currentPhoto.weightLbs ?? "unknown"} lbs, ${currentPhoto.bodyFatPct ?? "unknown"}% BF.\n\nUse the fitness data tools to assess current patterns, then describe what you see as a baseline.`,
      });
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: currentB64 },
      });
    }

    // Use generator prompt to pass images to the Agent SDK
    async function* messages() {
      yield {
        type: "user" as const,
        message: {
          role: "user" as const,
          content: contentBlocks,
        },
        parent_tool_use_id: null,
        session_id: "",
      };
    }

    const analysisResult = await Promise.race([
      (async (): Promise<string | null> => {
        try {
          const sdk = query({
            prompt: messages(),
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

    console.error(`[photos/analyze] Vision success | photoId=${photoId} | latency=${Date.now() - startTime}ms`);
    return NextResponse.json({ analysis: analysisResult, comparedWith: prevPhoto?.id ?? null });
  } catch (err) {
    console.error("[photos/analyze] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
