// ─── S05 Structural Verification ─────────────────────────────────────────────
// Checks that all S05 deliverables exist, export correctly, and match spec.

import * as fs from "fs";
import * as path from "path";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.resolve(relPath));
}

function fileContains(relPath: string, needle: string): boolean {
  if (!fileExists(relPath)) return false;
  return fs.readFileSync(path.resolve(relPath), "utf-8").includes(needle);
}

console.log("\n🔍 S05 Structural Verification\n");

// ── Pattern Detectors (T01) ──────────────────────────────────────────────────
console.log("Pattern Detectors:");
check("lib/patterns/index.ts exists", fileExists("lib/patterns/index.ts"));
check(
  "detectAll exported from lib/patterns/index.ts",
  fileContains("lib/patterns/index.ts", "export function detectAll")
);
check(
  "Nudge type exported from lib/patterns/index.ts",
  fileContains("lib/patterns/index.ts", "export interface Nudge") ||
    fileContains("lib/patterns/index.ts", "export type Nudge")
);

// ── Dashboard Integration (T01) ──────────────────────────────────────────────
console.log("\nDashboard Integration:");
check(
  "Dashboard route imports from lib/patterns",
  fileContains("app/api/dashboard/route.ts", "lib/patterns") ||
    fileContains("app/api/dashboard/route.ts", "@/lib/patterns")
);
check(
  "DashboardData includes nudges field",
  fileContains("app/api/dashboard/route.ts", "nudges")
);
check(
  "Dashboard page references NudgeCard or nudge rendering",
  fileContains("app/(tabs)/page.tsx", "NudgeCard") ||
    fileContains("app/(tabs)/page.tsx", "nudge")
);

// ── Weekly Summary (T02) ─────────────────────────────────────────────────────
console.log("\nWeekly Summary:");
check(
  "app/api/weekly/route.ts exists",
  fileExists("app/api/weekly/route.ts")
);
check(
  "Weekly route exports GET handler",
  fileContains("app/api/weekly/route.ts", "export async function GET")
);
check(
  "Weekly page exists",
  fileExists("app/(tabs)/weekly/page.tsx")
);
check(
  "Weekly page is a client component",
  fileContains("app/(tabs)/weekly/page.tsx", "'use client'") ||
    fileContains("app/(tabs)/weekly/page.tsx", '"use client"')
);
check(
  "Weekly page is not just a placeholder",
  fileContains("app/(tabs)/weekly/page.tsx", "StatComparisonRow") ||
    fileContains("app/(tabs)/weekly/page.tsx", "currentWeek") ||
    fileContains("app/(tabs)/weekly/page.tsx", "WeeklyData")
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(
  `  Total: ${passed + failed} checks — ${passed} passed, ${failed} failed`
);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

process.exit(failed > 0 ? 1 : 0);
