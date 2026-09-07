import { DateTime } from "luxon";

import { formatDate, STORE_TIMEZONE } from "@/app/lib/formatters";

/**
 * Sample dates for `PreviewProps`, always anchored to now.
 *
 * A hardcoded date rots. Within months the preview shows a session that already
 * happened and a waitlist deadline that already lapsed, and a reviewer reads
 * that as a broken template rather than as stale sample data. Anchoring to the
 * current day keeps every preview permanently plausible.
 *
 * Tests are the opposite case and must keep their fixed instants — a suite that
 * moves with the calendar is not a suite. Nothing here belongs in one.
 */
export function previewDate(
  daysFromNow: number,
  hour: number,
  minute = 0,
): Date {
  return DateTime.now()
    .setZone(STORE_TIMEZONE)
    .startOf("day")
    .plus({ days: daysFromNow, hours: hour, minutes: minute })
    .toJSDate();
}

/**
 * Mirrors `buildScheduleLabel` in `app/lib/programs/notifications.ts`, so a
 * preview shows the exact string a delivered email would carry.
 */
export function previewScheduleLabel(startsAt: Date, endsAt: Date): string {
  const start = formatDate(startsAt);
  const end = formatDate(endsAt);

  return `${start.toLocaleString(DateTime.DATETIME_MED)} — ${end.toLocaleString(
    DateTime.TIME_SIMPLE,
  )}`;
}

/** The single-instant form, as the waitlist deadline uses. */
export function previewDateTimeLabel(date: Date): string {
  return formatDate(date).toLocaleString(DateTime.DATETIME_MED);
}
