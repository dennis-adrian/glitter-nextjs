import { DateTime } from "luxon";

import { STORE_TIMEZONE } from "@/app/lib/formatters";

/**
 * A `datetime-local` value has no zone of its own: it is whatever the person
 * typing believes, and here that is always Bolivia's time. Reading it as La
 * Paz rather than as the browser's zone means an admin travelling, or a
 * laptop left on the wrong zone, still schedules the hour they wrote.
 * Client-safe and pure.
 */

const LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

/** "yyyy-MM-dd'T'HH:mm" read as La Paz time; null when it is not one. */
export function parseStoreDateTimeLocal(value: string): Date | null {
  const parsed = DateTime.fromFormat(value, LOCAL_FORMAT, {
    zone: STORE_TIMEZONE,
  });
  return parsed.isValid ? parsed.toJSDate() : null;
}

/** The instant as a `datetime-local` value, on La Paz's clock. */
export function toStoreDateTimeLocal(date: Date): string {
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE }).toFormat(
    LOCAL_FORMAT,
  );
}

/**
 * The picker's default: La Paz now, to the hour, plus 2 hours, so 10:12 and
 * 10:00 both give 12:00. A round time, and always well past the 5 minutes a
 * comunicado needs ahead.
 */
export function defaultScheduleValue(now: Date = new Date()): string {
  return DateTime.fromJSDate(now, { zone: STORE_TIMEZONE })
    .startOf("hour")
    .plus({ hours: 2 })
    .toFormat(LOCAL_FORMAT);
}
