import { sql } from "drizzle-orm";

/**
 * A `Date` bound for comparison against a `timestamp` (without time zone)
 * column.
 *
 * Passing a `Date` straight through as a parameter is silently wrong. The
 * driver serializes it in the *process's local* zone — `2026-07-29T10:52:58-04:00`
 * for a machine at UTC-4 — and Postgres's `timestamp` parser accepts the
 * trailing offset and then discards it, keeping the literal `10:52:58`. The
 * columns hold UTC wall-clock, so the comparison lands four hours out.
 *
 * The skew equals the server's UTC offset, so it is invisible on Vercel (UTC)
 * and wrong everywhere else — including local development and any script run
 * from a developer's machine. Worse, its direction flips with the sign of the
 * offset: west of UTC holds linger past their deadline, east of UTC they expire
 * early, which would release seats that are still held.
 *
 * Emitting the UTC wall-clock explicitly removes the dependency on where the
 * process happens to run.
 */
export function utcTimestamp(value: Date) {
  return sql`${value.toISOString()}::timestamp`;
}
