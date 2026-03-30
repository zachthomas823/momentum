"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { ema, derivedPace, projectedWeight } from "@/lib/engine";
import { TARGETS, daysTo } from "@/lib/engine/constants";
import { buildEventsFromData } from "@/lib/engine/events";
import type { DayEvents } from "@/lib/engine/events";
import type { DayRecord } from "@/lib/db/queries";
import EventCard, { ConfBadge } from "@/components/trajectory/EventCard";
import type { DayEvent } from "@/lib/engine/events";

// ─── Constants ───────────────────────────────────────────────────────────────

const H = 280;

type ZoomLevel = "day" | "week" | "month";

interface ZoomConfig {
  colWidth: number;
  label: string;
}

const ZOOM: Record<ZoomLevel, ZoomConfig> = {
  day: { colWidth: 110, label: "Day" },
  week: { colWidth: 80, label: "Week" },
  month: { colWidth: 100, label: "Month" },
};

// ─── Expanded Detail Panel ──────────────────────────────────────────────────

function ExpandedPanel({
  event,
  dayLabel,
  onClose,
}: {
  event: DayEvent;
  dayLabel: string;
  onClose: () => void;
}) {
  const impact = event.impact;
  if (!impact) return null;

  const color =
    event.good === true ? "#06d6a0" : event.good === false ? "#ef476f" : "#9aabb8";

  return (
    <div
      className="border-t border-white/10 p-4 overflow-y-auto"
      style={{ minHeight: "55vh", maxHeight: "75vh", background: "rgba(255,255,255,0.02)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold" style={{ color }}>{event.label}</span>
          <span className="text-xs text-t3">{dayLabel}</span>
        </div>
        <button onClick={onClose} className="text-t3 text-xs px-2 py-1 rounded-lg bg-white/5 border border-white/10 cursor-pointer">Close</button>
      </div>
      <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--t1)" }}>{impact.summary}</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {impact.weeklyTrajectoryShift && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/[0.06]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">Trajectory Shift</div>
            <div className="text-sm font-bold" style={{ color: "var(--amber)" }}>
              {impact.weeklyTrajectoryShift[0] > 0 ? "+" : ""}{(impact.weeklyTrajectoryShift[0] * 7).toFixed(2)} to {impact.weeklyTrajectoryShift[1] > 0 ? "+" : ""}{(impact.weeklyTrajectoryShift[1] * 7).toFixed(2)} lbs/wk
            </div>
          </div>
        )}
        {impact.kcalBurned && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/[0.06]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">Calories Burned</div>
            <div className="text-sm font-bold text-t1">{impact.kcalBurned[0]}–{impact.kcalBurned[1]} kcal</div>
          </div>
        )}
        {impact.duration && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/[0.06]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">Recovery</div>
            <div className="text-sm font-bold text-t1">{impact.duration}</div>
          </div>
        )}
      </div>
      <ConfBadge level={impact.conf} />
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dateDiffDays(a: string, b: string): number {
  return Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400000);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

function formatLabel(dateStr: string, zoom: ZoomLevel): string {
  const d = new Date(dateStr + "T12:00:00");
  if (zoom === "month") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  if (zoom === "week") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface TrajectoryProps {
  days: DayRecord[];
  onEventTap?: (eventId: string) => void;
  expandedEvent?: string | null;
  metric?: "weight" | "bf";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Trajectory({
  days,
  onEventTap,
  expandedEvent: controlledExpanded,
  metric = "weight",
}: TrajectoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [localExpanded, setLocalExpanded] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomLevel>("day");

  const expandedEvent = controlledExpanded !== undefined ? controlledExpanded : localExpanded;

  const handleEventTap = useCallback(
    (eventId: string) => {
      if (onEventTap) onEventTap(eventId);
      else setLocalExpanded((prev) => (prev === eventId ? null : eventId));
    },
    [onEventTap],
  );

  // ─── Compute timeline range ──────────────────────────────────────────────

  const today = todayStr();
  const isBf = metric === "bf";
  const accentRgb = isBf ? "6,214,160" : "245,166,35";
  const accentHex = isBf ? "#06d6a0" : "#f5a623";

  // Target events
  const targets = [
    { date: TARGETS.bachelorParty.date, label: "Bachelor Party", weight: TARGETS.bachelorParty.weight, bf: TARGETS.bachelorParty.bodyFat, icon: "🎉" },
    { date: TARGETS.wedding.date, label: "Wedding", weight: TARGETS.wedding.weight, bf: TARGETS.wedding.bodyFat, icon: "💍" },
  ];

  // Timeline: from 30 days ago to wedding + 7 days
  const startDate = days.length > 0 ? days[0].date : addDays(today, -30);
  const endDate = addDays(TARGETS.wedding.date, 7);
  const totalDays = dateDiffDays(startDate, endDate);

  // Build columns based on zoom level
  const colWidth = ZOOM[zoom].colWidth;

  interface Column {
    dateStart: string;
    dateEnd: string;
    label: string;
    isToday: boolean;
    isFuture: boolean;
    records: DayRecord[];
    avgVal: number | null;
    isTarget?: { label: string; icon: string };
  }

  const columns: Column[] = [];
  const pace = derivedPace(days, TARGETS.weeklyPaceLbs);
  const paceInMetric = isBf ? pace.rate * 0.15 : pace.rate;

  if (zoom === "day") {
    // Show last 14 days + projection to 14 days out
    const dayStart = addDays(today, -13);
    const dayEnd = addDays(today, 14);
    const numDays = dateDiffDays(dayStart, dayEnd);
    for (let i = 0; i <= numDays; i++) {
      const d = addDays(dayStart, i);
      const rec = days.filter(r => r.date === d);
      const v = rec.length > 0 ? (isBf ? rec[0].bodyFatPct : rec[0].weightLbs) : null;
      const target = targets.find(t => t.date === d);
      columns.push({
        dateStart: d, dateEnd: d,
        label: formatLabel(d, zoom),
        isToday: d === today,
        isFuture: d > today,
        records: rec,
        avgVal: v,
        isTarget: target ? { label: target.label, icon: target.icon } : undefined,
      });
    }
  } else if (zoom === "week") {
    // Group into weeks from start to end
    let cur = startDate;
    while (cur <= endDate) {
      const weekEnd = addDays(cur, 6);
      const recs = days.filter(r => r.date >= cur && r.date <= weekEnd);
      const vals = recs.map(r => isBf ? r.bodyFatPct : r.weightLbs).filter((v): v is number => v != null);
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const target = targets.find(t => t.date >= cur && t.date <= weekEnd);
      columns.push({
        dateStart: cur, dateEnd: weekEnd,
        label: formatLabel(cur, zoom),
        isToday: today >= cur && today <= weekEnd,
        isFuture: cur > today,
        records: recs,
        avgVal: avg,
        isTarget: target ? { label: target.label, icon: target.icon } : undefined,
      });
      cur = addDays(cur, 7);
    }
  } else {
    // Month zoom
    const s = new Date(startDate + "T12:00:00");
    const e = new Date(endDate + "T12:00:00");
    let curMonth = new Date(s.getFullYear(), s.getMonth(), 1);
    while (curMonth <= e) {
      const monthStart = curMonth.toLocaleDateString("en-CA");
      const nextMonth = new Date(curMonth.getFullYear(), curMonth.getMonth() + 1, 0);
      const monthEnd = nextMonth.toLocaleDateString("en-CA");
      const recs = days.filter(r => r.date >= monthStart && r.date <= monthEnd);
      const vals = recs.map(r => isBf ? r.bodyFatPct : r.weightLbs).filter((v): v is number => v != null);
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const target = targets.find(t => t.date >= monthStart && t.date <= monthEnd);
      columns.push({
        dateStart: monthStart, dateEnd: monthEnd,
        label: formatLabel(monthStart, zoom),
        isToday: today >= monthStart && today <= monthEnd,
        isFuture: monthStart > today,
        records: recs,
        avgVal: avg,
        isTarget: target ? { label: target.label, icon: target.icon } : undefined,
      });
      curMonth = new Date(curMonth.getFullYear(), curMonth.getMonth() + 1, 1);
    }
  }

  const totalW = columns.length * colWidth;

  // Build event data for day zoom only
  const eventData: DayEvents[] = zoom === "day"
    ? buildEventsFromData(columns.filter(c => !c.isFuture).map(c => c.records[0]).filter(Boolean))
    : [];

  // ─── Canvas rendering ──────────────────────────────────────────────────────

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || columns.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    c.width = totalW * dpr;
    c.height = H * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, totalW, H);

    // Dot grid
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    for (let x = 15; x < totalW; x += 28) {
      for (let y = 15; y < H; y += 28) {
        ctx.beginPath();
        ctx.arc(x, y, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const pad = { t: 20, b: 40 };
    const plotH = H - pad.t - pad.b;
    const unit = isBf ? "%" : "";

    // Collect all data points (past) and projection points (future)
    const dataPts: { x: number; val: number; col: number }[] = [];
    columns.forEach((col, i) => {
      if (col.avgVal != null && !col.isFuture) {
        dataPts.push({ x: i * colWidth + colWidth / 2, val: col.avgVal, col: i });
      }
    });

    // Last known value for projections
    const lastVal = dataPts.length > 0 ? dataPts[dataPts.length - 1].val : (isBf ? TARGETS.startBodyFat : TARGETS.startWeight);
    const lastCol = dataPts.length > 0 ? dataPts[dataPts.length - 1].col : 0;

    // Target values for Y-axis range
    const targetVal = isBf ? TARGETS.bachelorParty.bodyFat : TARGETS.bachelorParty.weight;
    const weddingVal = isBf ? TARGETS.wedding.bodyFat : TARGETS.wedding.weight;

    // Y-axis range: include data, targets, and projection range
    const allVals = dataPts.map(p => p.val);
    const projWeeksOut = 30;
    const projLow = lastVal - paceInMetric * projWeeksOut * 1.3;
    const projHigh = lastVal + paceInMetric * projWeeksOut * 0.3;

    let wMin = Math.min(
      ...(allVals.length ? allVals : [lastVal]),
      targetVal - 1,
      weddingVal - 1,
      projLow
    ) - (isBf ? 0.5 : 1);
    let wMax = Math.max(
      ...(allVals.length ? allVals : [lastVal]),
      lastVal + (isBf ? 1 : 2),
      projHigh
    ) + (isBf ? 0.5 : 1);

    const minRange = isBf ? 4 : 10;
    if (wMax - wMin < minRange) {
      const mid = (wMax + wMin) / 2;
      wMax = mid + minRange / 2;
      wMin = mid - minRange / 2;
    }

    const yScale = (v: number) => pad.t + plotH * (1 - (v - wMin) / (wMax - wMin));

    // ── Target lines (dashed) ─────────────────────────────────────────────
    for (const t of targets) {
      const tv = isBf ? t.bf : t.weight;
      if (tv >= wMin && tv <= wMax) {
        const ty = yScale(tv);
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = "rgba(6,214,160,0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, ty);
        ctx.lineTo(totalW, ty);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = "rgba(6,214,160,0.35)";
        ctx.font = "bold 9px 'DM Sans',sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(`${tv}${unit} — ${t.label}`, 8, ty - 5);
      }
    }

    // ── Target date markers (vertical) ────────────────────────────────────
    for (const t of targets) {
      const colIdx = columns.findIndex(c => t.date >= c.dateStart && t.date <= c.dateEnd);
      if (colIdx >= 0) {
        const x = colIdx * colWidth + colWidth / 2;
        ctx.save();
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = "rgba(6,214,160,0.3)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, H - pad.b);
        ctx.stroke();
        ctx.restore();
        // Icon at top
        ctx.font = "14px serif";
        ctx.textAlign = "center";
        ctx.fillText(t.icon, x, pad.t + 14);
      }
    }

    // ── Column separators ─────────────────────────────────────────────────
    columns.forEach((col, i) => {
      const x = i * colWidth + colWidth / 2;
      ctx.beginPath();
      ctx.strokeStyle = col.isToday ? `rgba(${accentRgb},0.3)` : "rgba(255,255,255,0.02)";
      ctx.lineWidth = col.isToday ? 1.5 : 0.5;
      if (col.isToday) ctx.setLineDash([5, 5]);
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, H - pad.b);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // ── EMA trend + confidence band ───────────────────────────────────────
    if (dataPts.length >= 2) {
      const smoothed = ema(dataPts.map(p => p.val));

      // Trend line through data
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${accentRgb},0.6)`;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      dataPts.forEach((p, i) => {
        const y = yScale(smoothed[i]);
        if (i === 0) ctx.moveTo(p.x, y);
        else ctx.lineTo(p.x, y);
      });
      ctx.stroke();

      // ── Projection with widening confidence band ────────────────────────
      const trendEnd = smoothed[smoothed.length - 1];
      const futureCols = columns.filter((_, i) => i > lastCol);

      if (futureCols.length > 0) {
        const projPts: { x: number; center: number; lo: number; hi: number }[] = [];
        futureCols.forEach((col, i) => {
          const weeksOut = (i + 1) * (zoom === "day" ? 1 / 7 : zoom === "week" ? 1 : 4);
          const proj = projectedWeight(trendEnd, paceInMetric, weeksOut);
          const colIdx = columns.indexOf(col);
          projPts.push({
            x: colIdx * colWidth + colWidth / 2,
            center: proj.center,
            lo: proj.low,
            hi: proj.high,
          });
        });

        // Confidence band (filled area)
        ctx.beginPath();
        ctx.fillStyle = `rgba(${accentRgb},0.06)`;
        // Upper edge (forward)
        const startX = dataPts[dataPts.length - 1].x;
        ctx.moveTo(startX, yScale(trendEnd));
        projPts.forEach(p => ctx.lineTo(p.x, yScale(p.hi)));
        // Lower edge (backward)
        for (let i = projPts.length - 1; i >= 0; i--) {
          ctx.lineTo(projPts[i].x, yScale(projPts[i].lo));
        }
        ctx.lineTo(startX, yScale(trendEnd));
        ctx.fill();

        // Upper bound line
        ctx.beginPath();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = `rgba(${accentRgb},0.15)`;
        ctx.lineWidth = 1;
        ctx.moveTo(startX, yScale(trendEnd));
        projPts.forEach(p => ctx.lineTo(p.x, yScale(p.hi)));
        ctx.stroke();

        // Lower bound line
        ctx.beginPath();
        ctx.moveTo(startX, yScale(trendEnd));
        projPts.forEach(p => ctx.lineTo(p.x, yScale(p.lo)));
        ctx.stroke();
        ctx.setLineDash([]);

        // Center projection line (dashed)
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = `rgba(${accentRgb},0.35)`;
        ctx.lineWidth = 2;
        ctx.moveTo(startX, yScale(trendEnd));
        projPts.forEach(p => ctx.lineTo(p.x, yScale(p.center)));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── Data dots ─────────────────────────────────────────────────────────
    dataPts.forEach(p => {
      const y = yScale(p.val);
      const g = ctx.createRadialGradient(p.x, y, 0, p.x, y, 10);
      g.addColorStop(0, `rgba(${accentRgb},0.2)`);
      g.addColorStop(1, `rgba(${accentRgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, y, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, y, zoom === "day" ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = accentHex;
      ctx.fill();

      // Labels only on day zoom
      if (zoom === "day") {
        ctx.fillStyle = `rgba(${accentRgb},0.8)`;
        ctx.font = "bold 10px 'Outfit',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${p.val.toFixed(1)}${unit}`, p.x, y - 10);
      }
    });

    // ── Y-axis labels ─────────────────────────────────────────────────────
    ctx.fillStyle = "rgba(154,171,184,0.3)";
    ctx.font = "9px 'DM Sans',sans-serif";
    ctx.textAlign = "left";
    const yStep = isBf ? Math.max(0.5, Math.ceil((wMax - wMin) / 5 * 2) / 2) : Math.ceil((wMax - wMin) / 5);
    for (let w = isBf ? Math.ceil(wMin * 2) / 2 : Math.ceil(wMin); w <= wMax; w += yStep) {
      ctx.fillText(`${isBf ? w.toFixed(1) + "%" : w}`, 4, yScale(w) + 3);
    }
  }, [columns, totalW, zoom, metric, isBf, accentRgb, accentHex, paceInMetric, days]);

  // ─── Auto-scroll to today on mount/zoom change ─────────────────────────

  useEffect(() => {
    if (!scrollRef.current) return;
    const todayIdx = columns.findIndex(c => c.isToday);
    if (todayIdx >= 0) {
      const targetScroll = Math.max(0, todayIdx * colWidth - scrollRef.current.clientWidth / 2);
      scrollRef.current.scrollLeft = targetScroll;
    }
  }, [zoom, colWidth, columns]);

  // ─── Scroll to target event ────────────────────────────────────────────

  const scrollToTarget = useCallback((targetDate: string) => {
    // Switch to appropriate zoom level
    const daysAway = dateDiffDays(today, targetDate);
    if (daysAway <= 28) setZoom("day");
    else if (daysAway <= 120) setZoom("week");
    else setZoom("month");

    // Scroll after zoom change settles
    setTimeout(() => {
      if (!scrollRef.current) return;
      const colIdx = columns.findIndex(c => targetDate >= c.dateStart && targetDate <= c.dateEnd);
      if (colIdx >= 0) {
        const targetScroll = Math.max(0, colIdx * colWidth - scrollRef.current.clientWidth / 2);
        scrollRef.current.scrollTo({ left: targetScroll, behavior: "smooth" });
      }
    }, 50);
  }, [today, columns, colWidth]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ background: "var(--card)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Zoom controls + target shortcuts */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1 z-[4] relative">
        {/* Zoom buttons */}
        <div className="flex rounded-full bg-white/5 p-0.5">
          {(["day", "week", "month"] as ZoomLevel[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                zoom === z ? "bg-amber text-[#0d1117]" : "text-t3"
              }`}
            >
              {ZOOM[z].label}
            </button>
          ))}
        </div>

        {/* Target shortcuts */}
        <div className="flex gap-1">
          {targets.map((t) => (
            <button
              key={t.date}
              onClick={() => scrollToTarget(t.date)}
              className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 cursor-pointer text-t3 hover:text-teal transition-colors"
            >
              {t.icon} {daysTo(t.date)}d
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable container */}
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden"
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
      >
        <div className="relative" style={{ width: totalW, height: H }}>
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0"
            style={{ width: totalW, height: H }}
          />

          {/* HTML overlay: date labels + event cards (day zoom only) */}
          <div className="absolute top-0 left-0 flex" style={{ width: totalW, height: H }}>
            {columns.map((col, i) => (
              <div
                key={`${col.dateStart}-${i}`}
                className="relative flex flex-col items-center justify-end"
                style={{ width: colWidth, height: H }}
              >
                {/* Event cards (day zoom, past only) */}
                {zoom === "day" && !col.isFuture && eventData[i] && (
                  <div className="flex flex-col items-center gap-0.5 z-[2] mb-0.5" style={{ width: colWidth - 12 }}>
                    {eventData[i]?.events?.map((ev, j) => (
                      <EventCard key={j} event={ev} eventId={`${i}-${j}`} onTap={handleEventTap} expanded={false} />
                    ))}
                  </div>
                )}

                {/* Target marker label */}
                {col.isTarget && (
                  <div className="absolute top-6 left-0 right-0 text-center z-[2]">
                    <div className="text-[9px] font-bold" style={{ color: "var(--teal)" }}>
                      {col.isTarget.label}
                    </div>
                  </div>
                )}

                {/* Bottom date label */}
                <div className="pb-2 text-center z-[2]">
                  <div
                    className="text-[10px]"
                    style={{
                      fontWeight: col.isToday ? 800 : 500,
                      color: col.isToday
                        ? accentHex
                        : col.isFuture ? "rgba(154,171,184,0.3)" : "var(--t3)",
                      fontFamily: "var(--font-b)",
                      fontSize: zoom === "day" ? 10 : 9,
                    }}
                  >
                    {col.isToday && zoom === "day" ? "TODAY" : col.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edge fades */}
      <div className="absolute top-0 left-0 w-6 h-full pointer-events-none z-[3]"
        style={{ background: "linear-gradient(90deg, var(--card), transparent)" }} />
      <div className="absolute top-0 right-0 w-6 h-full pointer-events-none z-[3]"
        style={{ background: "linear-gradient(270deg, var(--card), transparent)" }} />

      {/* Swipe hint */}
      {!expandedEvent && (
        <div className="absolute bottom-6 right-3 text-[9px] opacity-50 z-[3]"
          style={{ color: "var(--t3)", fontFamily: "var(--font-b)", fontWeight: 600 }}>
          ← swipe →
        </div>
      )}

      {/* Expanded event detail panel */}
      {expandedEvent && (() => {
        const [dayIdx, evIdx] = expandedEvent.split("-").map(Number);
        const ev = eventData[dayIdx]?.events?.[evIdx];
        if (!ev?.impact) return null;
        const col = columns[dayIdx];
        return (
          <ExpandedPanel
            event={ev}
            dayLabel={col?.isToday ? "Today" : col?.label ?? ""}
            onClose={() => handleEventTap(expandedEvent)}
          />
        );
      })()}
    </div>
  );
}
