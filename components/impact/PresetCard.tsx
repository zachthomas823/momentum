"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { ConfBadge } from "@/components/trajectory/EventCard";
import {
  compareNarrative,
  type ScenarioInput,
  type CompareResult,
  type ScenarioResult,
  type CascadeLink,
} from "@/lib/engine";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PresetCardProps {
  labelA: string;
  labelB: string;
  scenarioA: ScenarioInput;
  scenarioB: ScenarioInput;
  timeScale?: "single-event" | "weekly-pattern";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function DirectionArrow({ result }: { result: ScenarioResult }) {
  const isUp = result.isPositive;
  const color = isUp
    ? "var(--teal)"
    : result.isNegative
      ? "var(--rose)"
      : "var(--t2)";
  const rotation = isUp ? 0 : 180;

  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      style={{
        transform: `rotate(${rotation}deg)`,
        filter: `drop-shadow(0 0 6px ${color}44)`,
        transition: "transform 0.3s ease",
        flexShrink: 0,
      }}
    >
      <path
        d="M12 4L12 20M12 4L6 10M12 4L18 10"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatShift(shift: [number, number]): string {
  const lo = Math.abs(shift[0]);
  const hi = Math.abs(shift[1]);
  const sign = shift[0] < 0 ? "−" : "+";
  return `${sign}${(lo * 7).toFixed(2)} to ${sign}${(hi * 7).toFixed(2)} lbs/wk`;
}

function formatCleanDays(days: [number, number]): string {
  return `≈ ${days[0].toFixed(1)}–${days[1].toFixed(1)} clean days`;
}

// ─── Side Panel ──────────────────────────────────────────────────────────────

function SidePanel({
  label,
  result,
}: {
  label: string;
  result: ScenarioResult;
}) {
  const borderColor = result.isPositive
    ? "var(--teal)"
    : result.isNegative
      ? "var(--rose)"
      : "var(--t3)";

  return (
    <div
      className="flex-1 min-w-0 rounded-xl p-3"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${borderColor}33`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <DirectionArrow result={result} />
        <span
          className="text-xs font-bold truncate"
          style={{ color: borderColor, fontFamily: "var(--font-display)" }}
        >
          {label}
        </span>
      </div>

      {/* Trajectory shift */}
      <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--amber)" }}>
        {formatShift(result.totalWeeklyShift)}
      </div>

      {/* Clean days equivalent */}
      <div className="text-[11px] mb-2" style={{ color: "var(--t2)" }}>
        {formatCleanDays(result.daysEquiv)}
      </div>

      {/* Severity */}
      <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--t3)" }}>
        {result.direction} {result.severity}
      </div>

      {/* Mechanism chain from effects */}
      <div className="space-y-1 mb-2">
        {result.effects.map((effect, i) => (
          <div key={i} className="text-[10px] leading-snug" style={{ color: "var(--t2)" }}>
            <span style={{ color: "var(--t3)" }}>•</span>{" "}
            <span className="capitalize font-medium" style={{ color: "var(--t1)" }}>
              {effect.category}
            </span>
            : {effect.summary.slice(0, 80)}
            {effect.summary.length > 80 ? "…" : ""}
          </div>
        ))}
      </div>

      {/* Confidence */}
      {result.effects.length > 0 && (
        <ConfBadge level={result.effects[0].conf} />
      )}
    </div>
  );
}

// ─── Cascade Chain Display ───────────────────────────────────────────────────

function CascadeChainDisplay({ chain }: { chain: CascadeLink[] }) {
  return (
    <div
      className="mt-3 rounded-lg p-2.5"
      style={{
        background: "rgba(245,166,35,0.06)",
        border: "1px solid rgba(245,166,35,0.15)",
      }}
    >
      <div
        className="text-[10px] uppercase tracking-wider mb-1.5 font-bold"
        style={{ color: "var(--amber)" }}
      >
        Cascade Chain
      </div>
      {chain.map((link, i) => (
        <div key={i} className="flex items-center gap-1.5 mb-1 last:mb-0">
          <span
            className="text-[10px] font-bold capitalize shrink-0"
            style={{ color: "var(--t1)" }}
          >
            {link.from}
          </span>
          <span className="text-[10px]" style={{ color: "var(--amber)" }}>→</span>
          <span
            className="text-[10px] font-bold capitalize shrink-0"
            style={{ color: "var(--t1)" }}
          >
            {link.to}
          </span>
          <span className="text-[9px] truncate" style={{ color: "var(--t3)" }}>
            {link.mechanism}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── PresetCard ──────────────────────────────────────────────────────────────

export default function PresetCard({
  labelA,
  labelB,
  scenarioA,
  scenarioB,
  timeScale = "single-event",
}: PresetCardProps) {
  const [result, setResult] = useState<CompareResult | null>(null);

  useEffect(() => {
    // Engine is pure/synchronous but useEffect for SSR safety
    const comparison = compareNarrative(
      scenarioA,
      scenarioB,
      [labelA, labelB],
      timeScale
    );
    setResult(comparison);
  }, [scenarioA, scenarioB, labelA, labelB, timeScale]);

  if (!result) {
    // Loading skeleton
    return (
      <Card className="mb-4">
        <div className="animate-pulse">
          <div className="h-4 bg-white/5 rounded w-2/3 mb-3" />
          <div className="flex gap-3">
            <div className="flex-1 h-32 bg-white/5 rounded-xl" />
            <div className="flex-1 h-32 bg-white/5 rounded-xl" />
          </div>
        </div>
      </Card>
    );
  }

  // Collect cascade chains from both sides
  const cascadeChains = [
    ...(result.a.cascadeChain ?? []),
    ...(result.b.cascadeChain ?? []),
  ];
  // Dedupe by from+to
  const uniqueChains = cascadeChains.filter(
    (c, i, arr) => arr.findIndex((x) => x.from === c.from && x.to === c.to) === i
  );

  return (
    <Card className="mb-4">
      {/* Card title */}
      <h3
        className="text-sm font-bold mb-3"
        style={{ fontFamily: "var(--font-display)", color: "var(--t1)" }}
      >
        {result.labelA} <span style={{ color: "var(--t3)" }}>vs</span> {result.labelB}
      </h3>

      {/* Side-by-side panels */}
      <div className="flex gap-2">
        <SidePanel label={result.labelA} result={result.a} />
        <SidePanel label={result.labelB} result={result.b} />
      </div>

      {/* Cascade chain (if present on either side) */}
      {uniqueChains.length > 0 && <CascadeChainDisplay chain={uniqueChains} />}
    </Card>
  );
}
