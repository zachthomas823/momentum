import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Creates a Drizzle ORM instance using the Neon serverless HTTP driver.
 * Connection is created per-call (serverless pattern — no module-level pool).
 * Requires DATABASE_URL environment variable.
 */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return drizzle(url, { schema });
}

export type Db = ReturnType<typeof getDb>;
