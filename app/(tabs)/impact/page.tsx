"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Btn";
import { ConfBadge } from "@/components/trajectory/EventCard";
import PresetCard from "@/components/impact/PresetCard";
import ScenarioCard from "@/components/impact/ScenarioCard";
import type { ScenarioInput } from "@/lib/engine";

// ─── Preset Definitions ─────────────────────────────────────────────────────

const PRESETS: {
  labelA: string;
  labelB: string;
  scenarioA: ScenarioInput;
  scenarioB: ScenarioInput;
  timeScale: "single-event" | "weekly-pattern";
}[] = [
  {
    labelA: "Gym night",
    labelB: "Drinks night",
    scenarioA: { exercise: { type: "strength", duration: 50 }, sleep: 8, diet: 4, alcohol: 0 },
    scenarioB: { alcohol: 4, sleep: 5.5, diet: 2 },
    timeScale: "single-event",
  },
  {
    labelA: "8h sleep",
    labelB: "6h sleep",
    scenarioA: { sleep: 8, diet: 3 },
    scenarioB: { sleep: 6, diet: 3 },
    timeScale: "single-event",
  },
  {
    labelA: "Clean week",
    labelB: "Normal week",
    scenarioA: { diet: 4, alcohol: 0, sleep: 7.5 },
    scenarioB: { diet: 3, alcohol: 3, sleep: 6.5 },
    timeScale: "weekly-pattern",
  },
  {
    labelA: "Dry month",
    labelB: "2x/week",
    scenarioA: { alcohol: 0, diet: 4, sleep: 7.5 },
    scenarioB: { alcohol: 4, diet: 3, sleep: 6.5 },
    timeScale: "weekly-pattern",
  },
];

// ─── Scenario type (from API) ────────────────────────────────────────────────

interface SavedScenario {
  id: number;
  query: string;
  responseJson: {
    response?: string;
    summary?: string;
    confidence?: string;
    relatableEquiv?: string;
    mechanismChain?: string[];
    fallback?: boolean;
    [key: string]: unknown;
  };
  createdAt: string;
}

// ─── Ask Anything Response ───────────────────────────────────────────────────

interface AskResponse {
  response?: string;
  summary?: string;
  confidence?: string;
  relatableEquiv?: string;
  mechanismChain?: string[];
  trajectoryShift?: [number, number];
  fallback?: boolean;
  error?: string;
}

// ─── Impact Page ─────────────────────────────────────────────────────────────

export default function ImpactPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [askResult, setAskResult] = useState<AskResponse | null>(null);
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(true);

  // ── Fetch saved scenarios ──────────────────────────────────────────────

  const fetchScenarios = useCallback(async () => {
    try {
      const res = await fetch("/api/impact/scenarios");
      if (res.ok) {
        const data = await res.json();
        setScenarios(data.scenarios ?? []);
      }
    } catch (err) {
      console.error("[impact] Failed to fetch scenarios:", err);
    } finally {
      setScenariosLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScenarios();
  }, [fetchScenarios]);

  // ── Submit query ───────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setAskResult(null);

    try {
      // POST to analyze endpoint
      const res = await fetch("/api/impact/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      const data: AskResponse = await res.json();
      setAskResult(data);

      // Auto-save to scenarios (fire-and-forget)
      if (data.response || data.summary) {
        fetch("/api/impact/scenarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, response: data }),
        })
          .then(() => fetchScenarios())
          .catch((err) => console.error("[impact] Auto-save failed:", err));
      }
    } catch (err) {
      console.error("[impact] Query failed:", err);
      setAskResult({ error: "Something went wrong — try again" });
    } finally {
      setLoading(false);
    }
  };

  // ── Delete scenario ────────────────────────────────────────────────────

  const handleDelete = async (id: number) => {
    // Optimistic removal
    setScenarios((prev) => prev.filter((s) => s.id !== id));
    try {
      await fetch(`/api/impact/scenarios?id=${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("[impact] Delete failed:", err);
      fetchScenarios(); // Revert on failure
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[430px] mx-auto px-4 pb-8">
      {/* Page Header */}
      <div className="pt-8 pb-6 text-center">
        <span className="text-3xl">⟁</span>
        <h1
          className="text-2xl font-bold mt-1"
          style={{ fontFamily: "var(--font-display)", color: "var(--t1)" }}
        >
          Impact
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--t2)" }}>
          See how decisions cascade
        </p>
      </div>

      {/* ── Presets Section ──────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2
          className="text-sm font-bold uppercase tracking-wider mb-3"
          style={{ color: "var(--t3)", fontFamily: "var(--font-display)" }}
        >
          Head-to-Head
        </h2>
        {PRESETS.map((preset, i) => (
          <PresetCard key={i} {...preset} />
        ))}
      </section>

      {/* ── Ask Anything Section ─────────────────────────────────────────── */}
      <section className="mb-8">
        <h2
          className="text-sm font-bold uppercase tracking-wider mb-3"
          style={{ color: "var(--t3)", fontFamily: "var(--font-display)" }}
        >
          Ask Anything
        </h2>
        <Card>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder="What if I have 4 drinks tonight?"
              disabled={loading}
              className="flex-1 bg-transparent text-sm outline-none min-w-0"
              style={{
                color: "var(--t1)",
                fontFamily: "var(--font-body)",
              }}
            />
            <Btn
              onClick={handleSubmit}
              disabled={loading || !query.trim()}
              className="!px-3 !min-h-[36px] text-xs"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              ) : (
                "Ask"
              )}
            </Btn>
          </div>
        </Card>

        {/* Ask Result */}
        {askResult && (
          <Card className="mt-3">
            {askResult.error ? (
              <div className="text-sm" style={{ color: "var(--rose)" }}>
                {askResult.error}
              </div>
            ) : (
              <>
                {/* Response text */}
                <div className="text-[13px] leading-relaxed mb-2" style={{ color: "var(--t1)" }}>
                  {askResult.response ?? askResult.summary}
                </div>

                {/* Relatable equivalent */}
                {askResult.relatableEquiv && (
                  <div className="text-xs font-semibold mb-2" style={{ color: "var(--teal)" }}>
                    {askResult.relatableEquiv}
                  </div>
                )}

                {/* Mechanism chain */}
                {askResult.mechanismChain && askResult.mechanismChain.length > 0 && (
                  <div className="mb-2 space-y-0.5">
                    {askResult.mechanismChain.map((m, i) => (
                      <div
                        key={i}
                        className="text-[11px] leading-snug"
                        style={{ color: "var(--t2)" }}
                      >
                        <span style={{ color: "var(--t3)" }}>•</span> {m}
                      </div>
                    ))}
                  </div>
                )}

                {/* Trajectory shift */}
                {askResult.trajectoryShift && (
                  <div className="text-[11px] font-semibold mb-2" style={{ color: "var(--amber)" }}>
                    Weekly shift: {askResult.trajectoryShift[0] > 0 ? "+" : ""}
                    {(askResult.trajectoryShift[0] * 7).toFixed(2)} to{" "}
                    {askResult.trajectoryShift[1] > 0 ? "+" : ""}
                    {(askResult.trajectoryShift[1] * 7).toFixed(2)} lbs/wk
                  </div>
                )}

                {/* Confidence + fallback indicator */}
                <div className="flex items-center gap-2">
                  <ConfBadge level={askResult.confidence ?? "mod"} />
                  {askResult.fallback && (
                    <span className="text-[9px]" style={{ color: "var(--t3)" }}>
                      (instant — local engine)
                    </span>
                  )}
                </div>
              </>
            )}
          </Card>
        )}
      </section>

      {/* ── Scenario History Section ─────────────────────────────────────── */}
      <section>
        <h2
          className="text-sm font-bold uppercase tracking-wider mb-3"
          style={{ color: "var(--t3)", fontFamily: "var(--font-display)" }}
        >
          History
        </h2>

        {scenariosLoading ? (
          <Card>
            <div className="animate-pulse space-y-2">
              <div className="h-3 bg-white/5 rounded w-3/4" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          </Card>
        ) : scenarios.length === 0 ? (
          <Card>
            <div className="text-center py-4">
              <span className="text-2xl mb-2 block">💭</span>
              <p className="text-xs" style={{ color: "var(--t3)" }}>
                Ask a question above to start building your scenario history
              </p>
            </div>
          </Card>
        ) : (
          scenarios.map((s) => (
            <ScenarioCard key={s.id} scenario={s} onDelete={handleDelete} />
          ))
        )}
      </section>
    </div>
  );
}
