// ─── Event System ────────────────────────────────────────────────────────────
// Builds structured event lists from day records for the Trajectory overlay.
// Adapted from POC buildEventsFromData for flat DayRecord shape.

import { DIET } from "./constants";
import { alcoholImpact, sleepImpact, exerciseImpact, dietImpact } from "./index";
import type { DayRecord } from "@/lib/db/queries";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DayEvent {
  type: string;
  label: string;
  good: boolean | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  impact: any;
}

export interface DayEvents {
  day: number;
  date: string;
  events: DayEvent[];
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Build an event list from day records for the trajectory overlay.
 * Each day produces zero or more events (diet, alcohol, sleep, exercise).
 * Uses flat DayRecord fields (d.dietScore, d.totalDrinks, etc.).
 */
export function buildEventsFromData(days: DayRecord[]): DayEvents[] {
  return days.map((d, i) => {
    const events: DayEvent[] = [];

    // Diet event
    if (d.dietScore) {
      const imp = dietImpact(d.dietScore);
      events.push({
        type: "diet",
        label: DIET[d.dietScore]?.name || "Logged",
        good: imp?.good ?? null,
        impact: imp,
      });
    } else if (d.dietMode === "meals") {
      events.push({ type: "diet", label: "Meals logged", good: null, impact: null });
    }

    // Alcohol event
    if (d.totalDrinks != null && d.totalDrinks > 0) {
      const imp = alcoholImpact(d.totalDrinks);
      events.push({
        type: "alcohol",
        label: `${d.totalDrinks} drink${d.totalDrinks > 1 ? "s" : ""}`,
        good: false,
        impact: imp,
      });
    } else if (d.dry) {
      events.push({
        type: "alcohol",
        label: "Dry day ✨",
        good: true,
        impact: {
          summary:
            "No alcohol — fat oxidation unimpeded, sleep architecture intact, recovery optimal. Every dry day compounds.",
          conf: "high",
          weeklyTrajectoryShift: [-0.02, -0.05],
        },
      });
    }

    // Sleep event
    if (d.sleepTotalHours != null) {
      const imp = sleepImpact(d.sleepTotalHours);
      events.push({
        type: "sleep",
        label: `${d.sleepTotalHours.toFixed(1)}h sleep`,
        good: imp.good,
        impact: imp,
      });
    }

    // Strength session
    if (d.strengthSession) {
      const dur = d.activeMinutes ?? 45; // fallback like POC
      const imp = exerciseImpact("strength", dur);
      events.push({
        type: "gym",
        label: `Gym — ${dur} min`,
        good: true,
        impact: imp,
      });
    }

    // Run
    if (d.run) {
      const dur = d.activeMinutes ?? 30; // fallback like POC
      const imp = exerciseImpact("run", dur);
      events.push({
        type: "run",
        label: `Run — ${dur} min`,
        good: true,
        impact: imp,
      });
    }

    return { day: i, date: d.date, events };
  });
}
