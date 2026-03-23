// ─── Proxy private blob images ───────────────────────────────────────────────
// Uses @vercel/blob's get() to stream private images to the client.

import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url param required" }, { status: 400 });
  }

  if (!url.includes("blob.vercel-storage.com")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const result = await get(url, { access: "private" });
    if (!result) {
      return NextResponse.json({ error: "Blob not found" }, { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[photos/serve] Error:", err);
    return NextResponse.json({ error: "Failed to serve image" }, { status: 500 });
  }
}
