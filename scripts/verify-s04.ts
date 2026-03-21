// ─── S04 Structural Verification ─────────────────────────────────────────────
// Checks that all S04 deliverables exist, export correctly, and match spec.

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

console.log("\n🔍 S04 Structural Verification\n");

// ── File Existence ───────────────────────────────────────────────────────────
console.log("Files:");
check("lib/engine/keywords.ts exists", fileExists("lib/engine/keywords.ts"));
check("lib/engine/__tests__/cascade.test.ts exists", fileExists("lib/engine/__tests__/cascade.test.ts"));
check("lib/engine/__tests__/keywords.test.ts exists", fileExists("lib/engine/__tests__/keywords.test.ts"));
check("app/api/impact/analyze/route.ts exists", fileExists("app/api/impact/analyze/route.ts"));
check("app/api/impact/scenarios/route.ts exists", fileExists("app/api/impact/scenarios/route.ts"));
check("components/impact/PresetCard.tsx exists", fileExists("components/impact/PresetCard.tsx"));
check("components/impact/ScenarioCard.tsx exists", fileExists("components/impact/ScenarioCard.tsx"));
check("app/(tabs)/impact/page.tsx exists", fileExists("app/(tabs)/impact/page.tsx"));
check("vitest.config.ts exists", fileExists("vitest.config.ts"));

// ── Exports ──────────────────────────────────────────────────────────────────
console.log("\nExports:");
check("parseQuery exported from keywords", fileContains("lib/engine/keywords.ts", "export function parseQuery"));
check("CascadeLink exported from engine", fileContains("lib/engine/index.ts", "export interface CascadeLink"));
check("saveScenario in queries", fileContains("lib/db/queries.ts", "saveScenario"));
check("getScenarios in queries", fileContains("lib/db/queries.ts", "getScenarios"));
check("deleteScenario in queries", fileContains("lib/db/queries.ts", "deleteScenario"));
check("scenarios table in schema", fileContains("lib/db/schema.ts", "scenarios"));

// ── Preset Definitions ───────────────────────────────────────────────────────
console.log("\nPresets:");
const impactPage = fileExists("app/(tabs)/impact/page.tsx")
  ? fs.readFileSync(path.resolve("app/(tabs)/impact/page.tsx"), "utf-8")
  : "";
check("Gym night preset defined", impactPage.includes("Gym night"));
check("8h sleep preset defined", impactPage.includes("8h sleep"));
check("Clean week preset defined", impactPage.includes("Clean week"));
check("Dry month preset defined", impactPage.includes("Dry month"));

// ── ConfBadge Usage ──────────────────────────────────────────────────────────
console.log("\nConfidence Badges:");
check("ConfBadge imported in impact page", impactPage.includes("ConfBadge"));
check("ConfBadge imported in PresetCard", fileContains("components/impact/PresetCard.tsx", "ConfBadge"));
check("ConfBadge imported in ScenarioCard", fileContains("components/impact/ScenarioCard.tsx", "ConfBadge"));

// ── System Prompt Rules ──────────────────────────────────────────────────────
console.log("\nSystem Prompt:");
const analyzeRoute = fileExists("app/api/impact/analyze/route.ts")
  ? fs.readFileSync(path.resolve("app/api/impact/analyze/route.ts"), "utf-8")
  : "";
check("Rule 1 (ranges)", analyzeRoute.includes("Rule 1"));
check("Rule 5 (150 words)", analyzeRoute.includes("Rule 5"));
check("Rule 8 (relatable equiv)", analyzeRoute.includes("Rule 8"));
check("Rule 9 (no calorie counting)", analyzeRoute.includes("Rule 9"));

// ── Scenarios Table ──────────────────────────────────────────────────────────
console.log("\nSchema:");
check("scenarios pgTable in schema.ts", fileContains("lib/db/schema.ts", "pgTable('scenarios'") || fileContains("lib/db/schema.ts", "pgTable(\"scenarios\""));

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  Total: ${passed + failed} checks — ${passed} passed, ${failed} failed`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

process.exit(failed > 0 ? 1 : 0);
