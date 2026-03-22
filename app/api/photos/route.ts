// ─── Photo upload & listing API ──────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { put, getDownloadUrl } from "@vercel/blob";
import {
  getPhotosForDate,
  getPhotoTimeline,
  insertPhoto,
  getLatestWeight,
} from "@/lib/db/queries";

/** Generate signed download URLs for private blob photos. */
async function withDownloadUrls<T extends { blobUrl: string }>(
  photos: T[]
): Promise<(T & { downloadUrl: string })[]> {
  return Promise.all(
    photos.map(async (p) => {
      try {
        const downloadUrl = await getDownloadUrl(p.blobUrl);
        return { ...p, downloadUrl };
      } catch {
        return { ...p, downloadUrl: p.blobUrl };
      }
    })
  );
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date");
    const timeline = req.nextUrl.searchParams.get("timeline");

    if (timeline === "true") {
      const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);
      const photos = await getPhotoTimeline(limit);
      return NextResponse.json(await withDownloadUrls(photos));
    }

    if (!date) {
      return NextResponse.json(
        { error: "date query param required" },
        { status: 400 }
      );
    }

    const photos = await getPhotosForDate(date);
    return NextResponse.json(await withDownloadUrls(photos));
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

    // Return with signed download URL
    const downloadUrl = await getDownloadUrl(blob.url);
    return NextResponse.json({ ...record, downloadUrl });
  } catch (err) {
    console.error("[photos] Upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
