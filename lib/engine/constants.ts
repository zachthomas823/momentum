// ─── Engine Constants ────────────────────────────────────────────────────────
// Typed constants ported from POC app.jsx. All objects use explicit interfaces
// or `as const` for downstream type safety.

export interface TargetEvent {
  date: string;
  weight: number;
  bodyFat: number;
}

export interface Targets {
  bachelorParty: TargetEvent;
  wedding: TargetEvent;
  startWeight: number;
  startBodyFat: number;
  startDate: string;
  weeklyPaceLbs: number;
  height: number;
  age: number;
}

export const TARGETS: Targets = {
  bachelorParty: { date: "2026-08-20", weight: 200, bodyFat: 15.5 },
  wedding: { date: "2026-09-05", weight: 196, bodyFat: 14 },
  startWeight: 208.6,
  startBodyFat: 17.9,
  startDate: "2026-03-06",
  weeklyPaceLbs: 0.5,
  height: 72,   // inches
  age: 28,       // years
};

export interface DietTier {
  emoji: string;
  name: string;
  color: string;
  kcalDelta: [number, number];
}

export const DIET: Record<number, DietTier> = {
  1: { emoji: "🔥", name: "Dumpster Fire", color: "#ef476f", kcalDelta: [800, 1200] },
  2: { emoji: "😬", name: "Meh", color: "#f26522", kcalDelta: [200, 500] },
  3: { emoji: "😐", name: "Cruise Control", color: "#9aabb8", kcalDelta: [-200, 200] },
  4: { emoji: "💪", name: "Dialed In", color: "#06d6a0", kcalDelta: [-500, -300] },
  5: { emoji: "🎯", name: "Sniper Mode", color: "#4fc3f7", kcalDelta: [-700, -500] },
};

export interface ConfLevel {
  icon: string;
  label: string;
}

export const CONF: Record<string, ConfLevel> = {
  high: { icon: "🟢", label: "Well-established" },
  mod: { icon: "🟡", label: "Evidence-supported" },
  low: { icon: "🔴", label: "Plausible but uncertain" },
};

export const DRINKS = ["Beer", "Wine", "Liquor", "Cocktail"] as const;

/**
 * Days remaining until a target date, using local date math.
 * Returns ceiling of the difference (partial days count as 1).
 * Never uses toISOString() — always local midnight.
 */
export function daysTo(dateStr: string, timezone: string = "America/Los_Angeles"): number {
  const target = new Date(dateStr + "T12:00:00");
  // Use user's timezone for "today"
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  const today = new Date(todayStr + "T12:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}
