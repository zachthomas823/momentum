// ─── S03 Structural Verification ─────────────────────────────────────────────
// Checks that all required files and exports exist for the Dashboard & Trajectory slice.

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean) {
  if (ok) {
    console.log(`  ✅ ${name}`);
    pass++;
  } else {
    console.log(`  ❌ ${name}`);
    fail++;
  }
}

function fileExists(path: string): boolean {
  return fs.existsSync(path);
}

function fileContains(path: string, substr: string): boolean {
  if (!fs.existsSync(path)) return false;
  return fs.readFileSync(path, "utf-8").includes(substr);
}

function countExports(path: string, pattern: string): number {
  if (!fs.existsSync(path)) return 0;
  const content = fs.readFileSync(path, "utf-8");
  return (content.match(new RegExp(pattern, "g")) || []).length;
}

console.log("\n🔍 S03 Structural Verification\n");

// ── Engine Constants ─────────────────────────────────────────────────────────
console.log("Engine Constants (lib/engine/constants.ts):");
check("File exists", fileExists("lib/engine/constants.ts"));
check("Exports TARGETS", fileContains("lib/engine/constants.ts", "export const TARGETS"));
check("Exports DIET", fileContains("lib/engine/constants.ts", "export const DIET"));
check("Exports CONF", fileContains("lib/engine/constants.ts", "export const CONF"));
check("Exports daysTo", fileContains("lib/engine/constants.ts", "export function daysTo"));

// ── Engine Functions ─────────────────────────────────────────────────────────
console.log("\nEngine Functions (lib/engine/index.ts):");
check("File exists", fileExists("lib/engine/index.ts"));
const fnCount = countExports("lib/engine/index.ts", "export function");
check(`Exports ≥12 functions (found ${fnCount})`, fnCount >= 12);

// ── Events ───────────────────────────────────────────────────────────────────
console.log("\nEvent System (lib/engine/events.ts):");
check("File exists", fileExists("lib/engine/events.ts"));
check("Exports buildEventsFromData", fileContains("lib/engine/events.ts", "export function buildEventsFromData"));

// ── Trajectory Component ─────────────────────────────────────────────────────
console.log("\nTrajectory Component (components/Trajectory.tsx):");
check("File exists", fileExists("components/Trajectory.tsx"));
check("Is client component", fileContains("components/Trajectory.tsx", "'use client'") || fileContains("components/Trajectory.tsx", '"use client"'));
check("Has devicePixelRatio", fileContains("components/Trajectory.tsx", "devicePixelRatio"));

// ── EventCard Component ──────────────────────────────────────────────────────
console.log("\nEventCard Component (components/trajectory/EventCard.tsx):");
check("File exists", fileExists("components/trajectory/EventCard.tsx"));
check("Is client component", fileContains("components/trajectory/EventCard.tsx", "'use client'") || fileContains("components/trajectory/EventCard.tsx", '"use client"'));

// ── Dashboard API Route ──────────────────────────────────────────────────────
console.log("\nDashboard API (app/api/dashboard/route.ts):");
check("File exists", fileExists("app/api/dashboard/route.ts"));
check("Exports GET", fileContains("app/api/dashboard/route.ts", "export async function GET"));

// ── Dashboard Page ───────────────────────────────────────────────────────────
console.log("\nDashboard Page (app/(tabs)/page.tsx):");
check("File exists", fileExists("app/(tabs)/page.tsx"));
check("Is client component", fileContains("app/(tabs)/page.tsx", "'use client'") || fileContains("app/(tabs)/page.tsx", '"use client"'));
check("Imports Trajectory", fileContains("app/(tabs)/page.tsx", "Trajectory"));
check("Has competitive tagline", fileContains("app/(tabs)/page.tsx", "looking better than everyone"));

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("❌ VERIFICATION FAILED");
  process.exit(1);
} else {
  console.log("✅ ALL CHECKS PASSED");
}
