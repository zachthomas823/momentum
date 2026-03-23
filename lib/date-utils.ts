// ─── Timezone-aware date utilities ──────────────────────────────────────────
// Vercel runs in UTC. The user is in US Pacific time. All "today" calculations
// must use the user's local date, not UTC.

const USER_TIMEZONE = "America/Los_Angeles";

/** Get the current date string (YYYY-MM-DD) in the user's timezone. */
export function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: USER_TIMEZONE });
}

/** Get a Date object set to midnight in the user's timezone context. */
export function nowInUserTz(): Date {
  const dateStr = todayLocal();
  return new Date(dateStr + "T12:00:00");
}

/** Format a Date as YYYY-MM-DD using the user's timezone. */
export function formatDateLocal(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: USER_TIMEZONE });
}
