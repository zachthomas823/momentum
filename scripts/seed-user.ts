/**
 * Idempotent seed script — inserts or updates a single admin user.
 *
 * Usage:
 *   npx tsx scripts/seed-user.ts
 *
 * Environment:
 *   DATABASE_URL  — Neon connection string (loaded from .env.local)
 *   SEED_EMAIL    — defaults to admin@fitness.local
 *   SEED_PASSWORD — defaults to changeme123
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { getDb } from '../lib/db';
import { users } from '../lib/db/schema';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';

async function main() {
  const email = process.env.SEED_EMAIL ?? 'admin@fitness.local';
  const password = process.env.SEED_PASSWORD ?? 'changeme123';

  const passwordHash = await bcrypt.hash(password, 12);
  const db = getDb();

  // Upsert: insert or update password_hash on email conflict
  await db
    .insert(users)
    .values({ email, passwordHash })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash },
    });

  console.log(`✓ Seeded user: ${email}`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
