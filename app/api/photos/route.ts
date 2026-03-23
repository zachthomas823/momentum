// ─── Photo upload & listing API ──────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import {
  getPhotosForDate,
  getPhotoTimeline,
  insertPhoto,
  getLatestWeight,
} from "@/lib/db/queries";

/** Generate proxy URLs for private blob photos. */
function withProxyUrls<T extends { blobUrl: string }>(
  photos: T[]
): (T & { downloadUrl: string })[] {
  return photos.map((p) => ({
    ...p,
    downloadUrl: `/api/photos/serve?url=${encodeURIComponent(p.blobUrl)}`,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date");
    const timeline = req.nextUrl.searchParams.get("timeline");

    if (timeline === "true") {
      const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);
      const photos = await getPhotoTimeline(limit);
      return NextResponse.json(withProxyUrls(photos));
    }

    if (!date) {
      return NextResponse.json(
        { error: "date query param required" },
        { status: 400 }
      );
    }

    const photos = await getPhotosForDate(date);
    return NextResponse.json(withProxyUrls(photos));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const photo = formData.get("photo") as File | null;
    const date = formData.get("date") as string | null;
    const type = formData.get("type") as string | null;

    if (!photo || !date || !type) {
      return NextResponse.json(
        { error: "photo, date, and type are required" },
        { status: 400 }
      );
    }

    if (!["front", "side"].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'front' or 'side'" },
        { status: 400 }
      );
    }

    if (photo.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Photo must be under 5MB" },
        { status: 400 }
      );
    }

    // Upload to Vercel Blob (private store)
    const pathname = `progress/${date}/${type}-${Date.now()}.jpg`;
    const blob = await put(pathname, photo, { access: "private", addRandomSuffix: true });

    // Pair with weight/BF% from the same date
    const latestWeight = await getLatestWeight();
    const weightLbs = latestWeight?.weightLbs ?? null;
    const bodyFatPct = latestWeight?.bodyFatPct ?? null;

    const record = await insertPhoto({
      date,
      type,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      weightLbs,
      bodyFatPct,
    });

    // Return with proxy URL
    const downloadUrl = `/api/photos/serve?url=${encodeURIComponent(blob.url)}`;
    return NextResponse.json({ ...record, downloadUrl });
  } catch (err) {
    console.error("[photos] Upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
