// ─── S06 Structural Verification ─────────────────────────────────────────────
// Checks that all S06 (PWA & Integration) deliverables exist and are wired.

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

function fileSize(relPath: string): number {
  if (!fileExists(relPath)) return 0;
  return fs.statSync(path.resolve(relPath)).size;
}

console.log("\n🔍 S06 Structural Verification\n");

// ── PWA Manifest (T01) ──────────────────────────────────────────────────────
console.log("PWA Manifest:");
check("app/manifest.ts exists", fileExists("app/manifest.ts"));
check(
  "manifest.ts contains 'standalone' display mode",
  fileContains("app/manifest.ts", "standalone")
);
check(
  "manifest.ts references 192px icon",
  fileContains("app/manifest.ts", "192")
);
check(
  "manifest.ts references 512px icon",
  fileContains("app/manifest.ts", "512")
);

// ── Service Worker (T01) ─────────────────────────────────────────────────────
console.log("\nService Worker:");
check("public/sw.js exists", fileExists("public/sw.js"));
check(
  "sw.js contains fetch event listener",
  fileContains("public/sw.js", "fetch")
);
check(
  "sw.js contains sync event listener",
  fileContains("public/sw.js", "sync")
);

// ── Icons (T01) ──────────────────────────────────────────────────────────────
console.log("\nIcons:");
check(
  "public/icons/icon-192.png exists and is > 0 bytes",
  fileSize("public/icons/icon-192.png") > 0
);
check(
  "public/icons/icon-512.png exists and is > 0 bytes",
  fileSize("public/icons/icon-512.png") > 0
);

// ── RegisterSW Component (T01) ───────────────────────────────────────────────
console.log("\nRegisterSW:");
check(
  "components/RegisterSW.tsx exists",
  fileExists("components/RegisterSW.tsx")
);
check(
  "RegisterSW.tsx is a client component",
  fileContains("components/RegisterSW.tsx", "'use client'") ||
    fileContains("components/RegisterSW.tsx", '"use client"')
);

// ── Offline Queue (T01) ──────────────────────────────────────────────────────
console.log("\nOffline Queue:");
check("lib/offline-queue.ts exists", fileExists("lib/offline-queue.ts"));
check(
  "offline-queue.ts exports queueLog",
  fileContains("lib/offline-queue.ts", "queueLog")
);
check(
  "offline-queue.ts exports drainQueue",
  fileContains("lib/offline-queue.ts", "drainQueue")
);

// ── Wiring (T01) ─────────────────────────────────────────────────────────────
console.log("\nWiring:");
check(
  "app/layout.tsx imports RegisterSW",
  fileContains("app/layout.tsx", "RegisterSW")
);

// ── Export Route (T02) ───────────────────────────────────────────────────────
console.log("\nExport Route:");
check(
  "app/api/export/route.ts exists",
  fileExists("app/api/export/route.ts")
);
check(
  "export route exports GET handler",
  fileContains("app/api/export/route.ts", "export async function GET") ||
    fileContains("app/api/export/route.ts", "export function GET")
);
check(
  "export route sets Content-Disposition header",
  fileContains("app/api/export/route.ts", "Content-Disposition")
);

// ── Settings Page (T02) ─────────────────────────────────────────────────────
console.log("\nSettings Page:");
check(
  "app/(tabs)/settings/page.tsx exists",
  fileExists("app/(tabs)/settings/page.tsx")
);
check(
  "settings page is a client component",
  fileContains("app/(tabs)/settings/page.tsx", "'use client'") ||
    fileContains("app/(tabs)/settings/page.tsx", '"use client"')
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(
  `  Total: ${passed + failed} checks — ${passed} passed, ${failed} failed`
);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

process.exit(failed > 0 ? 1 : 0);
