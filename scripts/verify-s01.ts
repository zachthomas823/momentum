#!/usr/bin/env tsx
// ─── S01 Integration Verification Script ────────────────────────────────────
// Connects to Neon Postgres and validates the entire S01 pipeline:
// - All 9 tables exist
// - OAuth tokens present
// - Synced data present in log tables
// - Query functions return correct shapes

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local (Next.js convention) from project root
config({ path: resolve(__dirname, '..', '.env.local') });

// We can't use @/ path aliases in standalone tsx scripts, so use relative imports
import { getDb } from '../lib/db';
import { getDayRecords, getLatestWeight, getLast14Days } from '../lib/db/queries';
import { sql } from 'drizzle-orm';

const EXPECTED_TABLES = [
  'weight_logs',
  'sleep_logs',
  'activity_logs',
  'heart_rate_logs',
  'diet_logs',
  'alcohol_logs',
  'fitbit_tokens',
  'sync_history',
  'config',
];

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}: ${detail}`);
}

async function main() {
  console.log('═══ S01 Integration Verification ═══\n');

  // Verify DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set. Load .env.local or set it in your environment.');
    process.exit(1);
  }

  const db = getDb();

  // ── Check 1: All 9 tables exist ────────────────────────────────────────
  console.log('── Table existence ──');
  const tableRows = await db.execute<{ table_name: string }>(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  const existingTables = new Set(tableRows.rows.map((r) => r.table_name));

  for (const table of EXPECTED_TABLES) {
    check(`Table "${table}" exists`, existingTables.has(table), existingTables.has(table) ? 'found' : 'MISSING');
  }

  // ── Check 2: fitbit_tokens has at least 1 row ──────────────────────────
  console.log('\n── Data presence ──');
  const tokenCount = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count FROM fitbit_tokens
  `);
  const tokens = parseInt(tokenCount.rows[0]?.count ?? '0', 10);
  check('fitbit_tokens has rows', tokens > 0, `${tokens} row(s)`);

  // ── Check 3: weight_logs has at least 1 row ────────────────────────────
  const weightCount = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count FROM weight_logs
  `);
  const weights = parseInt(weightCount.rows[0]?.count ?? '0', 10);
  check('weight_logs has rows', weights > 0, `${weights} row(s)`);

  // ── Check 4: sleep_logs has at least 1 row ─────────────────────────────
  const sleepCount = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count FROM sleep_logs
  `);
  const sleeps = parseInt(sleepCount.rows[0]?.count ?? '0', 10);
  check('sleep_logs has rows', sleeps > 0, `${sleeps} row(s)`);

  // ── Check 5: activity_logs has at least 1 row ──────────────────────────
  const activityCount = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count FROM activity_logs
  `);
  const activities = parseInt(activityCount.rows[0]?.count ?? '0', 10);
  check('activity_logs has rows', activities > 0, `${activities} row(s)`);

  // ── Check 6: sync_history has at least 1 completed record ──────────────
  const completedSyncs = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count FROM sync_history WHERE completed_at IS NOT NULL
  `);
  const syncs = parseInt(completedSyncs.rows[0]?.count ?? '0', 10);
  check('sync_history has completed syncs', syncs > 0, `${syncs} completed sync(s)`);

  // ── Check 7: getDayRecords returns array with correct shape ────────────
  console.log('\n── Query function validation ──');
  try {
    const records = await getLast14Days();
    const isArray = Array.isArray(records);
    check('getLast14Days returns array', isArray, `${records.length} record(s)`);

    if (records.length > 0) {
      const sample = records[0];
      const hasDate = typeof sample.date === 'string';
      const hasNullableWeight = sample.weightLbs === null || typeof sample.weightLbs === 'number';
      const hasNullableSleep = sample.sleepTotalHours === null || typeof sample.sleepTotalHours === 'number';
      const hasNullableActivity = sample.steps === null || typeof sample.steps === 'number';
      check(
        'DayRecord has correct shape',
        hasDate && hasNullableWeight && hasNullableSleep && hasNullableActivity,
        `date=${sample.date}, weight=${sample.weightLbs}, sleep=${sample.sleepTotalHours}, steps=${sample.steps}`
      );
    } else {
      check('DayRecord has correct shape', true, 'No records in last 14 days (shape not testable, but query succeeded)');
    }
  } catch (err) {
    check('getLast14Days returns array', false, `Error: ${(err as Error).message}`);
    check('DayRecord has correct shape', false, 'Skipped due to getLast14Days failure');
  }

  // ── Check 8: getLatestWeight returns a value ───────────────────────────
  try {
    const latest = await getLatestWeight();
    const hasWeight = latest !== null && typeof latest.weightLbs === 'number';
    check('getLatestWeight returns weight', hasWeight, latest ? `${latest.weightLbs} lbs on ${latest.date}` : 'null');
  } catch (err) {
    check('getLatestWeight returns weight', false, `Error: ${(err as Error).message}`);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n═══ Summary ═══');
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`${passed}/${total} checks passed`);

  if (passed < total) {
    const failed = results.filter((r) => !r.passed);
    console.log('\nFailed checks:');
    for (const f of failed) {
      console.log(`  - ${f.name}: ${f.detail}`);
    }
    process.exit(1);
  }

  console.log('\n✅ All S01 verification checks passed!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
