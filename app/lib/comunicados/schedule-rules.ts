import {
  COMUNICADO_SCHEDULE_MAX_AHEAD_DAYS,
  COMUNICADO_SCHEDULE_MIN_LEAD_MS,
  COMUNICADO_SCHEDULE_OVERDUE_BANNER_MS,
} from "@/app/lib/comunicados/definitions";

/**
 * When a comunicado can be scheduled for, and when a schedule is overdue
 * (docs/IMPLEMENTATION-comunicados.md E5, E6). Client-safe and pure: the
 * dialog checks with the browser's clock what the action checks again with
 * the server's.
 */

/** Bolivia has no daylight saving time, so a day is always 24 hours. */
const MAX_AHEAD_MS = COMUNICADO_SCHEDULE_MAX_AHEAD_DAYS * 24 * 60 * 60_000;

export const SCHEDULE_DATE_MESSAGES = {
  invalid: "Elegí una fecha y hora válidas.",
  tooSoon: "Elegí una hora al menos 5 minutos más adelante.",
  tooFar: "Elegí una fecha dentro de los próximos 60 días.",
} as const;

/** Null when `at` is in [now + 5 min, now + 60 days], both inclusive. */
export function scheduleAtProblem(at: Date, nowMs: number): string | null {
  const atMs = at.getTime();
  if (!Number.isFinite(atMs)) return SCHEDULE_DATE_MESSAGES.invalid;
  if (atMs < nowMs + COMUNICADO_SCHEDULE_MIN_LEAD_MS) {
    return SCHEDULE_DATE_MESSAGES.tooSoon;
  }
  if (atMs > nowMs + MAX_AHEAD_MS) return SCHEDULE_DATE_MESSAGES.tooFar;
  return null;
}

/** now − scheduledAt ≥ COMUNICADO_SCHEDULE_OVERDUE_BANNER_MS. */
export function isScheduleOverdue(scheduledAt: Date, now: Date): boolean {
  return (
    now.getTime() - scheduledAt.getTime() >=
    COMUNICADO_SCHEDULE_OVERDUE_BANNER_MS
  );
}
