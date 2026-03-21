"use client";

import { useState } from "react";
import { CONF } from "@/lib/engine/constants";
import type { DayEvent } from "@/lib/engine/events";

// ─── Arrow ──────────────────────────────────────────────────────────────────

function Arrow({ good, size = 20 }: { good: boolean | null; size?: number }) {
  const color =
    good === true ? "#06d6a0" : good === false ? "#ef476f" : "#9aabb8";
  const glow =
    good === true
      ? "rgba(6,214,160,0.3)"
      : good === false
        ? "rgba(239,71,111,0.3)"
        : "rgba(154,171,184,0.15)";

  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        filter: `drop-shadow(0 0 6px ${glow})`,
        transform: `rotate(${good === false ? 180 : 0}deg)`,
        transition: "transform 0.3s ease",
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 4L12 20M12 4L6 10M12 4L18 10"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ─── ConfBadge ──────────────────────────────────────────────────────────────

export function ConfBadge({ level }: { level: string }) {
  const c = CONF[level];
  if (!c) return null;
  return (
    <span className="text-[11px] font-semibold" style={{ color: "var(--t3)" }}>
      {c.icon} {c.label}
    </span>
  );
}

// ─── ImpactDetail ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ImpactDetail({ impact }: { impact: any }) {
  if (!impact) return null;

  return (
    <div
      className="overflow-hidden mt-2 rounded-xl"
      style={{
        animation: "slideDown 0.3s ease",
        padding: "10px 12px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div
        className="text-[13px] leading-relaxed mb-2"
        style={{ color: "var(--t1)" }}
      >
        {impact.summary}
      </div>

      {impact.weeklyTrajectoryShift && (
        <div
          className="text-xs font-bold mb-1.5"
          style={{ color: "var(--amber)" }}
        >
          Trajectory shift:{" "}
          {impact.weeklyTrajectoryShift[0] > 0 ? "+" : ""}
          {(impact.weeklyTrajectoryShift[0] * 7).toFixed(2)} to{" "}
          {impact.weeklyTrajectoryShift[1] > 0 ? "+" : ""}
          {(impact.weeklyTrajectoryShift[1] * 7).toFixed(2)} lbs/week
        </div>
      )}

      {impact.kcalAdded && (
        <div className="text-[11px]" style={{ color: "var(--t2)" }}>
          Caloric impact: +{impact.kcalAdded[0]}–{impact.kcalAdded[1]} kcal
        </div>
      )}
      {impact.kcalBurned && (
        <div className="text-[11px]" style={{ color: "var(--t2)" }}>
          Calories burned: {impact.kcalBurned[0]}–{impact.kcalBurned[1]} kcal
        </div>
      )}
      {impact.kcalDelta && (
        <div className="text-[11px]" style={{ color: "var(--t2)" }}>
          Daily balance: {impact.kcalDelta[0] > 0 ? "+" : ""}
          {impact.kcalDelta[0]} to {impact.kcalDelta[1] > 0 ? "+" : ""}
          {impact.kcalDelta[1]} kcal
        </div>
      )}
      {impact.scaleImpact && (
        <div className="text-[11px] mt-1" style={{ color: "var(--t2)" }}>
          Scale impact: +{impact.scaleImpact[0]}–{impact.scaleImpact[1]} lbs (
          {impact.scaleNote})
        </div>
      )}
      {impact.duration && (
        <div className="text-[11px]" style={{ color: "var(--t2)" }}>
          Recovery: {impact.duration}
        </div>
      )}

      <div className="mt-1.5">
        <ConfBadge level={impact.conf} />
      </div>
    </div>
  );
}

// ─── EventCard ──────────────────────────────────────────────────────────────

interface EventCardProps {
  event: DayEvent;
  eventId: string;
  onTap?: (eventId: string) => void;
  expanded?: boolean;
}

export default function EventCard({
  event,
  eventId,
  onTap,
  expanded = false,
}: EventCardProps) {
  const color =
    event.good === true
      ? "#06d6a0"
      : event.good === false
        ? "#ef476f"
        : "#9aabb8";
  const bg =
    event.good === true
      ? "rgba(6,214,160,0.08)"
      : event.good === false
        ? "rgba(239,71,111,0.08)"
        : "rgba(154,171,184,0.05)";

  return (
    <div
      onClick={() => onTap?.(eventId)}
      className="cursor-pointer mb-1"
      style={{ minWidth: 0 }}
    >
      <div
        className="flex items-center gap-1.5 rounded-[10px] transition-all duration-200"
        style={{
          padding: "6px 10px",
          background: bg,
          border: expanded
            ? `1.5px solid ${color}`
            : `1px solid ${color}33`,
        }}
      >
        <Arrow good={event.good} size={16} />
        <span
          className="text-[11px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis flex-1"
          style={{ color }}
        >
          {event.label}
        </span>
        {event.impact && (
          <span
            className="text-[9px] shrink-0"
            style={{ color: "var(--t3)" }}
          >
            {expanded ? "▾" : "▸"}
          </span>
        )}
      </div>
      {expanded && event.impact && <ImpactDetail impact={event.impact} />}
    </div>
  );
}
