"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { ema, derivedPace } from "@/lib/engine";
import { TARGETS } from "@/lib/engine/constants";
import { buildEventsFromData } from "@/lib/engine/events";
import type { DayEvents } from "@/lib/engine/events";
import type { DayRecord } from "@/lib/db/queries";
import EventCard, { ConfBadge } from "@/components/trajectory/EventCard";
import type { DayEvent } from "@/lib/engine/events";

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_WIDTH = 130;
const H = 280;

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
      style={{
        minHeight: "55vh",
        maxHeight: "75vh",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold" style={{ color }}>
            {event.label}
          </span>
          <span className="text-xs text-t3">{dayLabel}</span>
        </div>
        <button
          onClick={onClose}
          className="text-t3 text-xs px-2 py-1 rounded-lg bg-white/5 border border-white/10 cursor-pointer"
        >
          Close
        </button>
      </div>

      {/* Summary */}
      <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--t1)" }}>
        {impact.summary}
      </p>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {impact.weeklyTrajectoryShift && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/[0.06]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">
              Trajectory Shift
            </div>
            <div className="text-sm font-bold" style={{ color: "var(--amber)" }}>
              {impact.weeklyTrajectoryShift[0] > 0 ? "+" : ""}
              {(impact.weeklyTrajectoryShift[0] * 7).toFixed(2)} to{" "}
              {impact.weeklyTrajectoryShift[1] > 0 ? "+" : ""}
              {(impact.weeklyTrajectoryShift[1] * 7).toFixed(2)} lbs/wk
            </div>
          </div>
        )}
        {impact.kcalAdded && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/[0.06]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">
              Caloric Impact
            </div>
            <div className="text-sm font-bold text-t1">
              +{impact.kcalAdded[0]}–{impact.kcalAdded[1]} kcal
            </div>
          </div>
        )}
        {impact.kcalBurned && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/[0.06]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">
              Calories Burned
            </div>
            <div className="text-sm font-bold text-t1">
              {impact.kcalBurned[0]}–{impact.kcalBurned[1]} kcal
            </div>
          </div>
        )}
        {impact.kcalDelta && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/[0.06]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">
              Daily Balance
            </div>
            <div className="text-sm font-bold text-t1">
              {impact.kcalDelta[0] > 0 ? "+" : ""}
              {impact.kcalDelta[0]} to {impact.kcalDelta[1] > 0 ? "+" : ""}
              {impact.kcalDelta[1]} kcal
            </div>
          </div>
        )}
        {impact.scaleImpact && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/[0.06]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">
              Scale Impact
            </div>
            <div className="text-sm font-bold text-t1">
              +{impact.scaleImpact[0]}–{impact.scaleImpact[1]} lbs
            </div>
            <div className="text-[10px] text-t3">{impact.scaleNote}</div>
          </div>
        )}
        {impact.duration && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/[0.06]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">
              Recovery
            </div>
            <div className="text-sm font-bold text-t1">{impact.duration}</div>
          </div>
        )}
      </div>

      <ConfBadge level={impact.conf} />
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface TrajectoryProps {
  days: DayRecord[];
  windowDays?: number;
  onEventTap?: (eventId: string) => void;
  expandedEvent?: string | null;
  metric?: "weight" | "bf";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Trajectory({
  days,
  windowDays = 7,
  onEventTap,
  expandedEvent: controlledExpanded,
  metric = "weight",
}: TrajectoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [localExpanded, setLocalExpanded] = useState<string | null>(null);

  // Support both controlled and uncontrolled expand
  const expandedEvent = controlledExpanded !== undefined ? controlledExpanded : localExpanded;

  const totalW = DAY_WIDTH * (windowDays + 3);

  // Build event data from the trailing window
  const pastDays = days.slice(-windowDays);
  const eventData: DayEvents[] = buildEventsFromData(pastDays);
  // Pad with 3 empty future days
  for (let i = 0; i < 3; i++) {
    eventData.push({ day: windowDays + i, date: "future", events: [] });
  }

  // Build day labels using local date formatting (never toISOString)
  const dayLabels: {
    dateKey: string;
    label: string;
    isToday: boolean;
    isFuture: boolean;
  }[] = [];
  for (let i = 0; i < windowDays + 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() - windowDays + 1 + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dayLabels.push({
      dateKey: `${y}-${m}-${day}`,
      label: d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      isToday: i === windowDays - 1,
      isFuture: i >= windowDays,
    });
  }

  // Handle event tap (toggle expand)
  const handleEventTap = useCallback(
    (eventId: string) => {
      if (onEventTap) {
        onEventTap(eventId);
      } else {
        setLocalExpanded((prev) => (prev === eventId ? null : eventId));
      }
    },
    [onEventTap],
  );

  // ─── Canvas rendering ───────────────────────────────────────────────────

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const dpr = window.devicePixelRatio || 1;
    c.width = totalW * dpr;
    c.height = H * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Dot grid background
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
    const nowFrac = (windowDays - 1) / (windowDays + 2);

    // Color scheme based on metric
    const isBf = metric === "bf";
    const accentRgb = isBf ? "6,214,160" : "245,166,35";
    const accentHex = isBf ? "#06d6a0" : "#f5a623";
    const targetVal = isBf ? TARGETS.bachelorParty.bodyFat : TARGETS.bachelorParty.weight;
    const startVal = isBf ? (TARGETS.startBodyFat ?? 18) : TARGETS.startWeight;
    const unit = isBf ? "%" : "";

    // Collect data points
    const dataPts: { x: number; val: number; idx: number }[] = [];
    pastDays.forEach((d, i) => {
      const v = isBf ? d.bodyFatPct : d.weightLbs;
      if (v != null) {
        dataPts.push({
          x: i * DAY_WIDTH + DAY_WIDTH / 2,
          val: v,
          idx: i,
        });
      }
    });

    // Y-axis range from data
    const allVals = dataPts.map((p) => p.val);
    const minRange = isBf ? 3 : 6;
    let wMax = allVals.length
      ? Math.max(...allVals) + (isBf ? 1 : 2)
      : startVal + (isBf ? 1 : 2);
    let wMin = allVals.length
      ? Math.min(Math.min(...allVals) - (isBf ? 1 : 2), targetVal - (isBf ? 0.5 : 1))
      : targetVal - (isBf ? 1 : 2);

    // Guard: ensure minimum range to prevent divide-by-zero
    if (wMax - wMin < minRange) {
      const mid = (wMax + wMin) / 2;
      wMax = mid + minRange / 2;
      wMin = mid - minRange / 2;
    }

    const yScale = (v: number) =>
      pad.t + plotH * (1 - (v - wMin) / (wMax - wMin));

    // Pace and last value for projections
    const pace = derivedPace(days);
    const lastW = allVals.length
      ? allVals[allVals.length - 1]
      : startVal;
    // For BF%, project using a rough ratio of BF% change per lb lost
    const paceInMetric = isBf ? pace.rate * 0.15 : pace.rate;
    const futureStart = windowDays * DAY_WIDTH;

    // Gradient band behind everything
    const bandGrad = ctx.createLinearGradient(0, 0, totalW, 0);
    bandGrad.addColorStop(0, `rgba(${accentRgb},0.15)`);
    bandGrad.addColorStop(nowFrac, `rgba(${accentRgb},0.12)`);
    bandGrad.addColorStop(
      Math.min(1, nowFrac + 0.1),
      "rgba(6,214,160,0.08)",
    );
    bandGrad.addColorStop(1, "rgba(6,214,160,0.03)");

    // Projection cone (3 future days)
    for (let i = 0; i < 3; i++) {
      const dayOff = i + 1;
      const projW = lastW - paceInMetric * (dayOff / 7);
      const unc = (isBf ? 0.1 : 0.4) * dayOff;
      const cx = futureStart + i * DAY_WIDTH + DAY_WIDTH / 2;
      const yHi = yScale(projW + unc);
      const yLo = yScale(projW - unc);
      ctx.fillStyle = `rgba(6,214,160,${0.06 - i * 0.015})`;
      ctx.beginPath();
      ctx.ellipse(cx, (yHi + yLo) / 2, DAY_WIDTH * 0.4, (yLo - yHi) / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Target line (dashed)
    if (targetVal >= wMin && targetVal <= wMax) {
      const ty = yScale(targetVal);
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = "rgba(6,214,160,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, ty);
      ctx.lineTo(totalW, ty);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "rgba(6,214,160,0.4)";
      ctx.font = "bold 9px 'DM Sans',sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${targetVal}${unit} target`, 8, ty - 5);
    }

    // Day separator lines (accent color for TODAY)
    for (let i = 0; i < dayLabels.length; i++) {
      const x = i * DAY_WIDTH + DAY_WIDTH / 2;
      ctx.beginPath();
      ctx.strokeStyle = dayLabels[i].isToday
        ? `rgba(${accentRgb},0.3)`
        : "rgba(255,255,255,0.03)";
      ctx.lineWidth = dayLabels[i].isToday ? 1.5 : 0.5;
      if (dayLabels[i].isToday) ctx.setLineDash([5, 5]);
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, H - pad.b);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // EMA trend line (only if 2+ data points)
    if (dataPts.length >= 2) {
      const smoothed = ema(dataPts.map((p) => p.val));

      // Solid trend through actual data
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
      // Extend trend into future (solid continuation)
      const trendEnd = smoothed[smoothed.length - 1];
      for (let i = 1; i <= 3; i++) {
        const px = futureStart + (i - 1) * DAY_WIDTH + DAY_WIDTH / 2;
        const pw = trendEnd - paceInMetric * (i / 7);
        ctx.lineTo(px, yScale(pw));
      }
      ctx.stroke();

      // Dashed projection overlay
      ctx.beginPath();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(6,214,160,0.35)";
      ctx.lineWidth = 2;
      ctx.moveTo(
        dataPts[dataPts.length - 1].x,
        yScale(trendEnd),
      );
      for (let i = 1; i <= 3; i++) {
        ctx.lineTo(
          futureStart + (i - 1) * DAY_WIDTH + DAY_WIDTH / 2,
          yScale(trendEnd - paceInMetric * (i / 7)),
        );
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Raw data dots with radial glow + labels
    dataPts.forEach((p) => {
      const y = yScale(p.val);
      // Glow
      const g = ctx.createRadialGradient(p.x, y, 0, p.x, y, 12);
      g.addColorStop(0, `rgba(${accentRgb},0.25)`);
      g.addColorStop(1, `rgba(${accentRgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, y, 12, 0, Math.PI * 2);
      ctx.fill();
      // Dot
      ctx.beginPath();
      ctx.arc(p.x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = accentHex;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, y, 4, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${accentRgb},0.5)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Label
      ctx.fillStyle = `rgba(${accentRgb},0.8)`;
      ctx.font = "bold 10px 'Outfit',sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${p.val.toFixed(1)}${unit}`, p.x, y - 10);
    });

    // Future zone fade overlay
    const fg = ctx.createLinearGradient(
      futureStart - 20,
      0,
      futureStart + 30,
      0,
    );
    fg.addColorStop(0, "rgba(13,17,23,0)");
    fg.addColorStop(1, "rgba(13,17,23,0.3)");
    ctx.fillStyle = fg;
    ctx.fillRect(futureStart - 20, 0, totalW - futureStart + 20, H);

    // Y-axis labels
    ctx.fillStyle = "rgba(154,171,184,0.3)";
    ctx.font = "9px 'DM Sans',sans-serif";
    ctx.textAlign = "left";
    const yStep = isBf ? Math.max(0.5, Math.ceil((wMax - wMin) / 4 * 2) / 2) : Math.ceil((wMax - wMin) / 4);
    for (let w = isBf ? Math.ceil(wMin * 2) / 2 : Math.ceil(wMin); w <= wMax; w += yStep) {
      ctx.fillText(`${isBf ? w.toFixed(1) + "%" : w}`, 4, yScale(w) + 3);
    }
  }, [windowDays, totalW, days, pastDays, dayLabels, metric]);

  // ─── Auto-scroll to TODAY on mount ───────────────────────────────────────

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = Math.max(0, (windowDays - 2) * DAY_WIDTH);
    }
  }, [windowDays]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: "var(--card)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Scrollable container */}
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        <div
          className="relative"
          style={{ width: totalW, height: H }}
        >
          {/* Canvas layer */}
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0"
            style={{ width: totalW, height: H }}
          />

          {/* HTML overlay: event cards + date labels */}
          <div
            className="absolute top-0 left-0 flex"
            style={{ width: totalW, height: H }}
          >
            {dayLabels.map((day, i) => {
              const ed = eventData[i];
              return (
                <div
                  key={`${day.dateKey}-${i}`}
                  className="relative flex flex-col items-center justify-end"
                  style={{ width: DAY_WIDTH, height: H }}
                >
                  {/* Event card stack — positioned above date label */}
                  <div
                    className="flex flex-col items-center gap-0.5 z-[2] mb-0.5"
                    style={{ width: DAY_WIDTH - 12 }}
                  >
                    {ed?.events?.map((ev, j) => (
                      <EventCard
                        key={j}
                        event={ev}
                        eventId={`${i}-${j}`}
                        onTap={handleEventTap}
                        expanded={false}
                      />
                    ))}
                  </div>

                  {/* Bottom date label */}
                  <div className="pb-2 text-center z-[2]">
                    <div
                      className="text-[10px]"
                      style={{
                        fontWeight: day.isToday ? 800 : 500,
                        color: day.isToday
                          ? (metric === "bf" ? "#06d6a0" : "#f5a623")
                          : day.isFuture
                            ? "rgba(154,171,184,0.3)"
                            : "var(--t3)",
                        fontFamily: "var(--font-b)",
                      }}
                    >
                      {day.isToday ? "TODAY" : day.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Edge-fade gradients */}
      <div
        className="absolute top-0 left-0 w-6 h-full pointer-events-none z-[3]"
        style={{
          background: "linear-gradient(90deg, var(--card), transparent)",
        }}
      />
      <div
        className="absolute top-0 right-0 w-6 h-full pointer-events-none z-[3]"
        style={{
          background: "linear-gradient(270deg, var(--card), transparent)",
        }}
      />

      {/* Swipe hint */}
      {!expandedEvent && (
        <div
          className="absolute bottom-6 right-3 text-[9px] opacity-50 z-[3]"
          style={{
            color: "var(--t3)",
            fontFamily: "var(--font-b)",
            fontWeight: 600,
          }}
        >
          ← swipe →
        </div>
      )}

      {/* ── Expanded event detail panel ─────────────────────────────── */}
      {expandedEvent && (() => {
        const [dayIdx, evIdx] = expandedEvent.split("-").map(Number);
        const ev = eventData[dayIdx]?.events?.[evIdx];
        if (!ev?.impact) return null;
        const dayLabel = dayLabels[dayIdx];
        return (
          <ExpandedPanel
            event={ev}
            dayLabel={dayLabel?.isToday ? "Today" : dayLabel?.label ?? ""}
            onClose={() => handleEventTap(expandedEvent)}
          />
        );
      })()}
    </div>
  );
}
