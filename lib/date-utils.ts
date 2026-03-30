// ─── Timezone-aware date utilities ──────────────────────────────────────────
// Vercel runs in UTC. The user is in US Pacific time by default. All "today"
// calculations must use the user's local date, not UTC.
// All functions accept an optional timezone param for DB-backed configuration.

const DEFAULT_TIMEZONE = "America/Los_Angeles";

/** Get the current date string (YYYY-MM-DD) in the user's timezone. */
export function todayLocal(timezone: string = DEFAULT_TIMEZONE): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: timezone });
}

/** Get a Date object set to noon in the user's timezone context. */
export function nowInUserTz(timezone: string = DEFAULT_TIMEZONE): Date {
  const dateStr = todayLocal(timezone);
  return new Date(dateStr + "T12:00:00");
}

/** Format a Date as YYYY-MM-DD using the user's timezone. */
export function formatDateLocal(d: Date, timezone: string = DEFAULT_TIMEZONE): string {
  return d.toLocaleDateString("en-CA", { timeZone: timezone });
}
