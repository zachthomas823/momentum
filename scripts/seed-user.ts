/**
 * Idempotent seed script — inserts or updates a single admin user,
 * their profile, and milestone goals.
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
import { users, userProfile, milestones } from '../lib/db/schema';
import bcrypt from 'bcryptjs';
import { eq, and, sql } from 'drizzle-orm';

async function main() {
  const email = process.env.SEED_EMAIL ?? 'admin@fitness.local';
  const password = process.env.SEED_PASSWORD ?? 'changeme123';

  const passwordHash = await bcrypt.hash(password, 12);
  const db = getDb();

  // Upsert user
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash },
    })
    .returning({ id: users.id });

  const userId = user.id;
  console.log(`✓ Seeded user: ${email} (id=${userId})`);

  // Upsert profile with TARGETS values
  await db
    .insert(userProfile)
    .values({
      userId,
      name: 'Zach',
      age: 28,
      sex: 'male',
      heightInches: 72,
      activityLevel: 'moderate',
      aiPersona: 'coach',
      timezone: 'America/Los_Angeles',
      startWeight: 208.6,
      startBodyFat: 17.9,
      startDate: '2026-03-06',
      weeklyPaceLbs: 0.5,
    })
    .onConflictDoUpdate({
      target: userProfile.userId,
      set: {
        name: 'Zach',
        age: 28,
        sex: 'male',
        heightInches: 72,
        activityLevel: 'moderate',
        aiPersona: 'coach',
        timezone: 'America/Los_Angeles',
        startWeight: 208.6,
        startBodyFat: 17.9,
        startDate: '2026-03-06',
        weeklyPaceLbs: 0.5,
        updatedAt: sql`now()`,
      },
    });

  console.log('✓ Seeded user profile');

  // Upsert milestones — Bachelor Party and Wedding
  const milestoneData = [
    {
      userId,
      label: 'Bachelor Party',
      type: 'event' as const,
      targetDate: '2026-08-20',
      targetWeight: 200,
      targetBodyFat: 15.5,
      isPrimary: false,
      sortOrder: 1,
    },
    {
      userId,
      label: 'Wedding',
      type: 'event' as const,
      targetDate: '2026-09-05',
      targetWeight: 196,
      targetBodyFat: 14,
      isPrimary: true,
      sortOrder: 2,
    },
  ];

  for (const ms of milestoneData) {
    // Check if milestone already exists for this user + label
    const existing = await db
      .select({ id: milestones.id })
      .from(milestones)
      .where(and(eq(milestones.userId, userId), eq(milestones.label, ms.label)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(milestones)
        .set({
          type: ms.type,
          targetDate: ms.targetDate,
          targetWeight: ms.targetWeight,
          targetBodyFat: ms.targetBodyFat,
          isPrimary: ms.isPrimary,
          sortOrder: ms.sortOrder,
        })
        .where(eq(milestones.id, existing[0].id));
    } else {
      await db.insert(milestones).values(ms);
    }

    console.log(`✓ Seeded milestone: ${ms.label}`);
  }

  console.log('✓ Seed complete');

  // Ask if user wants to redeploy to Vercel
  const rl = await import('readline');
  const prompt = rl.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    prompt.question('\nDeploy to Vercel production? (y/N) ', resolve);
  });
  prompt.close();

  if (answer.trim().toLowerCase() === 'y') {
    const { execSync } = await import('child_process');
    console.log('\nDeploying to Vercel...');
    try {
      execSync('npx vercel --prod', { stdio: 'inherit' });
    } catch {
      console.error('Vercel deploy failed. Run `npx vercel --prod` manually.');
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
