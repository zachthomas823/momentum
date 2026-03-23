// ─── Proxy private blob images ───────────────────────────────────────────────
// Fetches private blob images server-side (with BLOB_READ_WRITE_TOKEN) and
// streams them to the client. This avoids exposing the blob token to the browser.

import { NextRequest, NextResponse } from "next/server";
import { getDownloadUrl } from "@vercel/blob";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url param required" }, { status: 400 });
  }

  // Only allow our own blob store URLs
  if (!url.includes("blob.vercel-storage.com")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    // getDownloadUrl generates a short-lived authenticated URL
    const signedUrl = await getDownloadUrl(url);

    // Fetch the image from blob storage
    const res = await fetch(signedUrl);
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch image" }, { status: res.status });
    }

    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=3600", // cache 1 hour
      },
    });
  } catch (err) {
    console.error("[photos/serve] Error:", err);
    return NextResponse.json({ error: "Failed to serve image" }, { status: 500 });
  }
}
