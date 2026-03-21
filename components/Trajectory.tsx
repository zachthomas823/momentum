"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { ema, derivedPace } from "@/lib/engine";
import { TARGETS } from "@/lib/engine/constants";
import { buildEventsFromData } from "@/lib/engine/events";
import type { DayEvents } from "@/lib/engine/events";
import type { DayRecord } from "@/lib/db/queries";
import EventCard from "@/components/trajectory/EventCard";

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_WIDTH = 130;
const H = 280;

// ─── Props ───────────────────────────────────────────────────────────────────

interface TrajectoryProps {
  days: DayRecord[];
  windowDays?: number;
  onEventTap?: (eventId: string) => void;
  expandedEvent?: string | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Trajectory({
  days,
  windowDays = 7,
  onEventTap,
  expandedEvent: controlledExpanded,
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

    // Collect weight data points
    const weightPts: { x: number; lbs: number; idx: number }[] = [];
    pastDays.forEach((d, i) => {
      if (d.weightLbs != null) {
        weightPts.push({
          x: i * DAY_WIDTH + DAY_WIDTH / 2,
          lbs: d.weightLbs,
          idx: i,
        });
      }
    });

    // Y-axis range from data — guard single-point with ±3 lbs min range
    const allWeights = weightPts.map((p) => p.lbs);
    let wMax = allWeights.length
      ? Math.max(...allWeights) + 2
      : TARGETS.startWeight + 2;
    let wMin = allWeights.length
      ? Math.min(Math.min(...allWeights) - 2, TARGETS.bachelorParty.weight - 1)
      : TARGETS.bachelorParty.weight - 2;

    // Guard: ensure minimum 6 lb range (±3) to prevent divide-by-zero
    if (wMax - wMin < 6) {
      const mid = (wMax + wMin) / 2;
      wMax = mid + 3;
      wMin = mid - 3;
    }

    const yScale = (lbs: number) =>
      pad.t + plotH * (1 - (lbs - wMin) / (wMax - wMin));

    // Pace and last weight for projections
    const pace = derivedPace(days);
    const lastW = allWeights.length
      ? allWeights[allWeights.length - 1]
      : TARGETS.startWeight;
    const futureStart = windowDays * DAY_WIDTH;

    // Gradient band behind everything
    const bandGrad = ctx.createLinearGradient(0, 0, totalW, 0);
    bandGrad.addColorStop(0, "rgba(245,166,35,0.15)");
    bandGrad.addColorStop(nowFrac, "rgba(245,166,35,0.12)");
    bandGrad.addColorStop(
      Math.min(1, nowFrac + 0.1),
      "rgba(6,214,160,0.08)",
    );
    bandGrad.addColorStop(1, "rgba(6,214,160,0.03)");

    // Projection cone (3 future days)
    for (let i = 0; i < 3; i++) {
      const dayOff = i + 1;
      const projW = lastW - pace.rate * (dayOff / 7);
      const unc = 0.4 * dayOff;
      const cx = futureStart + i * DAY_WIDTH + DAY_WIDTH / 2;
      const yHi = yScale(projW + unc);
      const yLo = yScale(projW - unc);
      ctx.fillStyle = `rgba(6,214,160,${0.06 - i * 0.015})`;
      ctx.beginPath();
      ctx.ellipse(cx, (yHi + yLo) / 2, DAY_WIDTH * 0.4, (yLo - yHi) / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Target line (dashed)
    if (
      TARGETS.bachelorParty.weight >= wMin &&
      TARGETS.bachelorParty.weight <= wMax
    ) {
      const ty = yScale(TARGETS.bachelorParty.weight);
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
      ctx.fillText(`${TARGETS.bachelorParty.weight} target`, 8, ty - 5);
    }

    // Day separator lines (amber for TODAY)
    for (let i = 0; i < dayLabels.length; i++) {
      const x = i * DAY_WIDTH + DAY_WIDTH / 2;
      ctx.beginPath();
      ctx.strokeStyle = dayLabels[i].isToday
        ? "rgba(245,166,35,0.3)"
        : "rgba(255,255,255,0.03)";
      ctx.lineWidth = dayLabels[i].isToday ? 1.5 : 0.5;
      if (dayLabels[i].isToday) ctx.setLineDash([5, 5]);
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, H - pad.b);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // EMA trend line (only if 2+ weight points)
    if (weightPts.length >= 2) {
      const smoothed = ema(weightPts.map((p) => p.lbs));

      // Solid trend through actual data
      ctx.beginPath();
      ctx.strokeStyle = "rgba(245,166,35,0.6)";
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      weightPts.forEach((p, i) => {
        const y = yScale(smoothed[i]);
        if (i === 0) ctx.moveTo(p.x, y);
        else ctx.lineTo(p.x, y);
      });
      // Extend trend into future (solid continuation)
      const trendEnd = smoothed[smoothed.length - 1];
      for (let i = 1; i <= 3; i++) {
        const px = futureStart + (i - 1) * DAY_WIDTH + DAY_WIDTH / 2;
        const pw = trendEnd - pace.rate * (i / 7);
        ctx.lineTo(px, yScale(pw));
      }
      ctx.stroke();

      // Dashed projection overlay
      ctx.beginPath();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(6,214,160,0.35)";
      ctx.lineWidth = 2;
      ctx.moveTo(
        weightPts[weightPts.length - 1].x,
        yScale(trendEnd),
      );
      for (let i = 1; i <= 3; i++) {
        ctx.lineTo(
          futureStart + (i - 1) * DAY_WIDTH + DAY_WIDTH / 2,
          yScale(trendEnd - pace.rate * (i / 7)),
        );
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Raw weight dots with radial glow + labels
    weightPts.forEach((p) => {
      const y = yScale(p.lbs);
      // Glow
      const g = ctx.createRadialGradient(p.x, y, 0, p.x, y, 12);
      g.addColorStop(0, "rgba(245,166,35,0.25)");
      g.addColorStop(1, "rgba(245,166,35,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, y, 12, 0, Math.PI * 2);
      ctx.fill();
      // Dot
      ctx.beginPath();
      ctx.arc(p.x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#f5a623";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, y, 4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(245,166,35,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Label
      ctx.fillStyle = "rgba(245,166,35,0.8)";
      ctx.font = "bold 10px 'Outfit',sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.lbs.toFixed(1), p.x, y - 10);
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

    // Y-axis weight labels
    ctx.fillStyle = "rgba(154,171,184,0.3)";
    ctx.font = "9px 'DM Sans',sans-serif";
    ctx.textAlign = "left";
    const yStep = Math.ceil((wMax - wMin) / 4);
    for (let w = Math.ceil(wMin); w <= wMax; w += yStep) {
      ctx.fillText(`${w}`, 4, yScale(w) + 3);
    }
  }, [windowDays, totalW, days, pastDays, dayLabels]);

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
                  className="relative flex flex-col items-center pt-2"
                  style={{ width: DAY_WIDTH, height: H }}
                >
                  {/* Event card stack */}
                  <div
                    className="flex flex-col items-center gap-0.5 z-[2]"
                    style={{ width: DAY_WIDTH - 12 }}
                  >
                    {ed?.events?.map((ev, j) => (
                      <EventCard
                        key={j}
                        event={ev}
                        eventId={`${i}-${j}`}
                        onTap={handleEventTap}
                        expanded={expandedEvent === `${i}-${j}`}
                      />
                    ))}
                  </div>

                  {/* Bottom date label */}
                  <div className="absolute bottom-2 left-0 right-0 text-center z-[2]">
                    <div
                      className="text-[10px]"
                      style={{
                        fontWeight: day.isToday ? 800 : 500,
                        color: day.isToday
                          ? "#f5a623"
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
    </div>
  );
}
