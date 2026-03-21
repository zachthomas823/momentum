// ─── /api/impact/scenarios — CRUD for saved "What if?" scenarios ─────────────
// GET  — list recent scenarios (limit via query param, default 20)
// POST — save a new scenario
// DELETE — remove a scenario by id

import { NextRequest, NextResponse } from "next/server";
import {
  saveScenario,
  getScenarios,
  deleteScenario,
} from "@/lib/db/queries";

// ─── GET /api/impact/scenarios ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitStr = searchParams.get("limit");
    const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100) : 20;

    const rows = await getScenarios(limit);
    return NextResponse.json({ scenarios: rows });
  } catch (err) {
    console.error("[scenarios] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch scenarios" },
      { status: 500 }
    );
  }
}

// ─── POST /api/impact/scenarios ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, response, cascade } = body ?? {};

    if (!query || typeof query !== "string" || !response) {
      return NextResponse.json(
        { error: "Missing required fields: 'query' and 'response'" },
        { status: 400 }
      );
    }

    const saved = await saveScenario(query, response, cascade);
    return NextResponse.json({ scenario: saved }, { status: 201 });
  } catch (err) {
    console.error("[scenarios] POST failed:", err);
    return NextResponse.json(
      { error: "Failed to save scenario" },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/impact/scenarios ────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idStr = searchParams.get("id");

    if (!idStr) {
      return NextResponse.json(
        { error: "Missing 'id' query parameter" },
        { status: 400 }
      );
    }

    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid 'id' — must be a number" },
        { status: 400 }
      );
    }

    const deleted = await deleteScenario(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Scenario not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[scenarios] DELETE failed:", err);
    return NextResponse.json(
      { error: "Failed to delete scenario" },
      { status: 500 }
    );
  }
}
