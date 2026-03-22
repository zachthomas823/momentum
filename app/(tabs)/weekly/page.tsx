'use client';

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Btn } from "@/components/ui/Btn";

// ─── Types (mirrored from API) ───────────────────────────────────────────────

interface StatRow {
  label: string;
  key: string;
  current: number | null;
  previous: number | null;
  delta: number | null;
  goodDirection: "higher" | "lower";
  unit: string;
}

interface DayRecord {
  date: string;
  weightLbs: number | null;
  sleepTotalHours: number | null;
  strengthSession: boolean | null;
  dietScore: number | null;
  totalDrinks: number | null;
  dry: boolean | null;
  steps: number | null;
  [key: string]: unknown;
}

interface WeeklyData {
  weekOf: string;
  currentWeek: StatRow[];
  days: DayRecord[];
  consistency: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** True if delta direction is "good" (improvement). */
function isImprovement(row: StatRow): boolean | null {
  if (row.delta == null) return null;
  if (row.delta === 0) return null;
  return row.goodDirection === "higher" ? row.delta > 0 : row.delta < 0;
}

function formatVal(v: number | null, unit: string): string {
  if (v == null) return "—";
  if (unit === "/5") return v.toFixed(1);
  if (unit === "hrs") return v.toFixed(1);
  if (unit === "lbs") return v.toFixed(1);
  return String(v);
}

function deltaStr(d: number | null): string {
  if (d == null) return "";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d % 1 === 0 ? d : d.toFixed(1)}`;
}

/** Get day-of-week index (0=Mon, 6=Sun) from YYYY-MM-DD string. */
function dayIndex(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00");
  const dow = d.getDay(); // 0=Sun
  return dow === 0 ? 6 : dow - 1;
}

/** Check if a day has any logged data. */
function hasData(d: DayRecord): boolean {
  return (
    d.weightLbs != null ||
    d.sleepTotalHours != null ||
    d.steps != null ||
    d.dietScore != null ||
    d.totalDrinks != null ||
    d.dry != null ||
    d.strengthSession != null
  );
}

// ─── Components ──────────────────────────────────────────────────────────────

function StatComparisonRow({ row }: { row: StatRow }) {
  const improvement = isImprovement(row);
  const deltaColor =
    improvement === true
      ? "text-teal"
      : improvement === false
        ? "text-rose"
        : "text-t3";
  const arrowIcon =
    row.delta != null && row.delta !== 0
      ? row.delta > 0
        ? "↑"
        : "↓"
      : "→";

  return (
    <div className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-b-0">
      <span className="text-t2 text-sm flex-1">{row.label}</span>
      <div className="flex items-center gap-3">
        <span className="text-t3 text-sm tabular-nums w-12 text-right" style={{ fontFamily: "var(--font-display)" }}>
          {formatVal(row.previous, row.unit)}
        </span>
        <span className="text-t3 text-xs">{arrowIcon}</span>
        <span className="text-t1 text-sm font-semibold tabular-nums w-12 text-right" style={{ fontFamily: "var(--font-display)" }}>
          {formatVal(row.current, row.unit)}
        </span>
        {row.delta != null && row.delta !== 0 && (
          <span
            className={`text-xs font-bold tabular-nums min-w-[40px] text-right ${deltaColor}`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {deltaStr(row.delta)}
          </span>
        )}
        {(row.delta == null || row.delta === 0) && (
          <span className="min-w-[40px]" />
        )}
      </div>
    </div>
  );
}

function DayCard({ dayName, record }: { dayName: string; record: DayRecord | null }) {
  const logged = record && hasData(record);
  return (
    <div
      className={`rounded-xl border p-3 text-center min-w-0 ${
        logged
          ? "border-white/[0.08] bg-raised/50"
          : "border-white/[0.04] bg-transparent opacity-40"
      }`}
    >
      <div className="text-[11px] font-bold uppercase tracking-wider text-t3 mb-2">
        {dayName}
      </div>
      {record && logged ? (
        <div className="space-y-1">
          {record.strengthSession && (
            <div className="text-[11px] text-amber">💪</div>
          )}
          {record.dietScore != null && (
            <div className="text-[11px] text-teal">
              🍽 {record.dietScore.toFixed(0)}
            </div>
          )}
          {(record.totalDrinks ?? 0) > 0 && (
            <div className="text-[11px] text-rose">
              🍷 {record.totalDrinks}
            </div>
          )}
          {record.dry === true && record.totalDrinks == null && (
            <div className="text-[11px] text-teal">🚫🍷</div>
          )}
          {record.sleepTotalHours != null && (
            <div className="text-[11px] text-sky">
              😴 {record.sleepTotalHours.toFixed(1)}
            </div>
          )}
        </div>
      ) : (
        <div className="text-t3 text-[11px]">—</div>
      )}
    </div>
  );
}

function ConsistencyBar({ value }: { value: number }) {
  const days = Math.round(value * 7);
  const pct = Math.min(value * 100, 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: pct >= 71 ? "var(--teal)" : pct >= 43 ? "var(--amber)" : "var(--rose)",
          }}
        />
      </div>
      <span
        className="text-sm font-bold text-t1 tabular-nums"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {days}/7
      </span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 mt-8">
      <Card>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-white/[0.06] rounded w-1/3" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-white/[0.06] rounded" />
          ))}
        </div>
      </Card>
      <Card>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-white/[0.06] rounded w-1/4" />
          <div className="grid grid-cols-7 gap-2">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-16 bg-white/[0.06] rounded-xl" />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function WeeklyPage() {
  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Momentum analysis state
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisRefreshing, setAnalysisRefreshing] = useState(false);

  const fetchAnalysis = useCallback(async (refresh = false) => {
    if (refresh) setAnalysisRefreshing(true);
    try {
      const url = refresh ? "/api/weekly/analysis?refresh=true" : "/api/weekly/analysis";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.analysis) setAnalysis(data.analysis);
      }
    } catch {
      // non-fatal
    } finally {
      setAnalysisLoading(false);
      setAnalysisRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/weekly")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    fetchAnalysis();
  }, [fetchAnalysis]);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <Card className="mt-8">
        <div className="text-center py-8">
          <span className="text-rose text-sm">Failed to load weekly data: {error}</span>
        </div>
      </Card>
    );
  }

  if (!data) return null;

  // Build a lookup: dayIndex -> DayRecord for the current week
  const dayMap = new Map<number, DayRecord>();
  for (const d of data.days) {
    dayMap.set(dayIndex(d.date), d);
  }

  return (
    <div className="space-y-4 mt-8">
      {/* ── Momentum Analysis ──────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <Label>Momentum</Label>
          {analysis && (
            <button
              onClick={() => fetchAnalysis(true)}
              disabled={analysisRefreshing}
              className="text-[10px] text-t3 px-2 py-1 rounded-lg bg-white/5 border border-white/10 cursor-pointer disabled:opacity-50"
            >
              {analysisRefreshing ? "..." : "Refresh"}
            </button>
          )}
        </div>
        {analysisLoading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-3 bg-white/[0.06] rounded w-full" />
            <div className="h-3 bg-white/[0.06] rounded w-5/6" />
            <div className="h-3 bg-white/[0.06] rounded w-4/6" />
            <div className="h-3 bg-white/[0.06] rounded w-full" />
            <div className="h-3 bg-white/[0.06] rounded w-3/4" />
          </div>
        ) : analysis ? (
          <p
            className="text-[13px] leading-[1.7] whitespace-pre-wrap"
            style={{ color: "var(--t1)" }}
          >
            {analysis}
          </p>
        ) : (
          <div className="text-center py-4">
            <p className="text-xs text-t3 mb-3">Analysis couldn&apos;t be generated right now</p>
            <Btn
              onClick={() => fetchAnalysis(true)}
              disabled={analysisRefreshing}
              className="text-xs"
            >
              {analysisRefreshing ? "Generating..." : "Generate Analysis"}
            </Btn>
          </div>
        )}
      </Card>

      {/* Week-over-Week Stats */}
      <Card>
        <Label className="mb-3 block">Week-over-Week</Label>
        <div>
          {data.currentWeek.map((row) => (
            <StatComparisonRow key={row.key} row={row} />
          ))}
        </div>
      </Card>

      {/* Day-by-Day Breakdown */}
      <Card>
        <Label className="mb-3 block">Day by Day</Label>
        <div className="grid grid-cols-7 gap-2">
          {DAY_NAMES.map((name, i) => (
            <DayCard key={name} dayName={name} record={dayMap.get(i) ?? null} />
          ))}
        </div>
      </Card>

      {/* Logging Consistency */}
      <Card>
        <Label className="mb-3 block">Logging Consistency</Label>
        <ConsistencyBar value={data.consistency} />
      </Card>
    </div>
  );
}
