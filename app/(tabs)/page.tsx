"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Label } from "@/components/ui/Label";
import Trajectory from "@/components/Trajectory";
import { ConfBadge } from "@/components/trajectory/EventCard";
import { NudgeCard } from "@/components/NudgeCard";
import type { DashboardData } from "@/app/api/dashboard/route";

// ─── Pace helpers ────────────────────────────────────────────────────────────

function paceLabel(rate: number): string {
  if (rate > 0.7) return "Ahead of pace";
  if (rate > 0.3) return "On pace";
  if (rate > 0) return "Slow";
  return "Stalled";
}

function paceColor(rate: number): string {
  if (rate > 0.3) return "var(--teal)";
  if (rate > 0) return "var(--amber)";
  return "var(--rose)";
}

// ─── Scorecard color helpers ─────────────────────────────────────────────────

function strengthColor(days: number): string {
  if (days >= 3) return "var(--teal)";
  if (days >= 2) return "var(--gold)";
  return "var(--rose)";
}

function dietLogColor(days: number): string {
  if (days >= 5) return "var(--teal)";
  if (days >= 3) return "var(--gold)";
  return "var(--rose)";
}

function drinkColor(days: number): string {
  if (days === 0) return "var(--teal)";
  if (days <= 2) return "var(--gold)";
  return "var(--rose)";
}

function sleepColor(avg: number | null): string {
  if (avg == null) return "var(--t3)";
  if (avg >= 7.5) return "var(--teal)";
  if (avg >= 6.5) return "var(--gold)";
  return "var(--rose)";
}

// ─── Dashboard Page ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [showBf, setShowBf] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("dashboardMetric");
    if (saved === "bf") setShowBf(true);
  }, []);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: DashboardData) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        console.error("[Dashboard] Fetch error:", e);
        setError(e.message);
        setLoading(false);
      });
  }, []);

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-4 mt-8 animate-pulse">
        <div className="h-6 w-3/4 bg-raised rounded" />
        <div className="flex gap-3">
          <div className="h-24 flex-1 bg-raised rounded-2xl" />
          <div className="h-24 flex-1 bg-raised rounded-2xl" />
        </div>
        <div className="h-64 bg-raised rounded-2xl" />
        <div className="flex gap-3">
          <div className="h-20 flex-1 bg-raised rounded-2xl" />
          <div className="h-20 flex-1 bg-raised rounded-2xl" />
        </div>
        <div className="h-28 bg-raised rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="mt-8">
        <div className="text-center py-12">
          <span className="text-3xl mb-3 block">⚠️</span>
          <p className="text-t2 text-sm">
            {error ?? "Failed to load dashboard data"}
          </p>
        </div>
      </Card>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const { pace, tdee, milestones, scorecard } = data;
  const displayWeight = data.currentWeight ?? data.profile.startWeight;
  const displayBf = data.currentBodyFat;

  // Find primary milestones for display
  const primaryCountdowns = data.countdowns.slice(0, 2);
  const firstCountdown = primaryCountdowns[0];
  const secondCountdown = primaryCountdowns[1];

  // Find weight targets from milestones for the toggle card
  const primaryMilestone = data.userMilestones.find((m) => m.isPrimary) ?? data.userMilestones[0];
  const targetWeight = primaryMilestone?.targetWeight;
  const targetBodyFat = primaryMilestone?.targetBodyFat;

  return (
    <div className="flex flex-col gap-4 pb-[100px]">
      {/* ── Competitive Tagline (R019) ───────────────────────────────────── */}
      <p
        className="text-center font-bold text-sm mt-4 px-4"
        style={{
          fontFamily: "var(--font-display)",
          color: "var(--amber)",
        }}
      >
        {firstCountdown ? `${firstCountdown.daysLeft} days to ${firstCountdown.label.toLowerCase()}.` : "Track your progress."}
      </p>

      {/* ── Milestone Celebrations ───────────────────────────────────────── */}
      {milestones.length > 0 && (
        <Card className="border-teal/20">
          <div className="flex flex-col gap-2">
            {milestones.slice(-2).map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-lg">{m.icon}</span>
                <span
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ color: "var(--teal)" }}
                >
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Countdown Cards ──────────────────────────────────────────────── */}
      {primaryCountdowns.length > 0 && (
      <div className="flex gap-3">
        {primaryCountdowns.map((cd) => (
          <Card key={cd.label} className="flex-1">
            <div className="flex flex-col items-center text-center">
              <span className="text-lg mb-1">{cd.icon}</span>
              <span
                className="font-bold"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 36,
                  color: "var(--amber)",
                  textShadow: "0 0 20px rgba(245,166,35,0.3)",
                }}
              >
                {cd.daysLeft}
              </span>
              <span className="text-t2 text-[10px] uppercase tracking-widest font-bold">
                {cd.label}
              </span>
            </div>
          </Card>
        ))}
      </div>
      )}

      {/* ── Trajectory Section ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <Label>Your Trajectory</Label>
          <Pill color={paceColor(pace.rate)}>
            {paceLabel(pace.rate)}
          </Pill>
        </div>
        <Trajectory
          days={data.days}
          onEventTap={(id) => setExpandedEvent(id === expandedEvent ? null : id)}
          expandedEvent={expandedEvent}
          metric={showBf ? "bf" : "weight"}
        />
      </div>

      {/* ── Weight / BF% Toggle Card ──────────────────────────────────────── */}
      <div
        className="cursor-pointer active:scale-[0.98] transition-transform"
        onClick={() => {
          const next = !showBf;
          setShowBf(next);
          localStorage.setItem("dashboardMetric", next ? "bf" : "weight");
        }}
      >
      <Card>
        <div className="flex flex-col items-center text-center">
          <Label>{showBf ? "Body Fat" : "Weight"}</Label>
          <span
            className="font-bold mt-1"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 36,
              color: showBf ? "var(--teal)" : "var(--amber)",
              textShadow: showBf
                ? "0 0 20px rgba(6,214,160,0.3)"
                : "0 0 20px rgba(245,166,35,0.3)",
            }}
          >
            {showBf
              ? data.bf7dSma != null ? `${data.bf7dSma.toFixed(1)}%` : "—"
              : data.weight7dSma != null ? `${data.weight7dSma.toFixed(1)}` : "—"}
          </span>
          <span className="text-t3 text-[10px] mt-0.5">
            {showBf
              ? targetBodyFat != null ? `Target: ${targetBodyFat}% · 7-day avg` : "7-day avg"
              : targetWeight != null ? `Target: ${targetWeight} lbs · 7-day avg` : "7-day avg"}
          </span>
          <span className="text-t3 text-[9px] mt-1 opacity-50">
            tap to switch
          </span>
        </div>
      </Card>
      </div>

      {/* ── Weekly Scorecard ──────────────────────────────────────────────── */}
      <Card>
        <Label>This Week</Label>
        <div className="grid grid-cols-4 gap-2 mt-3 text-center">
          {/* Strength */}
          <div className="flex flex-col items-center gap-1">
            <span
              className="text-lg font-bold"
              style={{
                fontFamily: "var(--font-display)",
                color: strengthColor(scorecard.strengthDays),
              }}
            >
              {scorecard.strengthDays}
              <span className="text-t3 text-xs">/3</span>
            </span>
            <span className="text-t2 text-[9px] uppercase tracking-wider font-bold">
              Strength
            </span>
          </div>

          {/* Diet Log */}
          <div className="flex flex-col items-center gap-1">
            <span
              className="text-lg font-bold"
              style={{
                fontFamily: "var(--font-display)",
                color: dietLogColor(scorecard.dietLogDays),
              }}
            >
              {scorecard.dietLogDays}
              <span className="text-t3 text-xs">/7</span>
            </span>
            <span className="text-t2 text-[9px] uppercase tracking-wider font-bold">
              Diet Log
            </span>
          </div>

          {/* Drinks */}
          <div className="flex flex-col items-center gap-1">
            <span
              className="text-lg font-bold"
              style={{
                fontFamily: "var(--font-display)",
                color: drinkColor(scorecard.drinkingDays),
              }}
            >
              {scorecard.drinkingDays}
              <span className="text-t3 text-xs">d</span>
            </span>
            <span className="text-t2 text-[9px] uppercase tracking-wider font-bold">
              Drinks
            </span>
          </div>

          {/* Sleep */}
          <div className="flex flex-col items-center gap-1">
            <span
              className="text-lg font-bold"
              style={{
                fontFamily: "var(--font-display)",
                color: sleepColor(scorecard.avgSleep),
              }}
            >
              {scorecard.avgSleep != null
                ? scorecard.avgSleep.toFixed(1)
                : "—"}
              <span className="text-t3 text-xs">h</span>
            </span>
            <span className="text-t2 text-[9px] uppercase tracking-wider font-bold">
              Sleep
            </span>
          </div>
        </div>
      </Card>

      {/* ── Pattern Nudges (S05) ─────────────────────────────────────────── */}
      {data.nudges.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.nudges.map((nudge, i) => (
            <NudgeCard key={`${nudge.type}-${i}`} nudge={nudge} />
          ))}
        </div>
      )}

      {/* ── Pace Projection Card ─────────────────────────────────────────── */}
      <Card>
        <Label>Pace Projection</Label>
        <div className="mt-3 space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-t2 text-xs">Weekly Rate</span>
            <span
              className="font-bold text-sm"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--amber)",
                textShadow: "0 0 12px rgba(245,166,35,0.2)",
              }}
            >
              {pace.rate > 0
                ? `${pace.rate.toFixed(2)} lbs/wk`
                : "No loss detected"}
            </span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-t2 text-xs">Est. TDEE</span>
            <span className="text-t1 text-sm font-semibold">
              {Math.round(tdee.tdee)} kcal
            </span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-t2 text-xs">Avg Steps</span>
            <span className="text-t1 text-sm font-semibold">
              {tdee.avgSteps.toLocaleString()}
            </span>
          </div>
          {scorecard.drinkingDays === 0 && (
            <p className="text-teal text-[10px] mt-1">
              🎉 Zero drinking days this week — max fat oxidation
            </p>
          )}
          <div className="flex justify-end mt-1">
            <ConfBadge level={pace.confidence} />
          </div>
        </div>
      </Card>
    </div>
  );
}
