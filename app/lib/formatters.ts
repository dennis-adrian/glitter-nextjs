import { DateTime } from "luxon";

export function formatDate(date: Date | string): DateTime {
  const isoDate = date instanceof Date ? date.toISOString() : date;
  return DateTime.fromISO(isoDate, {
    zone: "America/La_Paz",
  }).setLocale("es");
}

export function formatDateToTimezone(date: Date): Date {
  return new Date(date.getTime() - 4 * 60 * 60 * 1000);
}

export function formatFullDate(date: Date): string {
  return formatDate(date).toLocaleString(DateTime.DATE_FULL);
}

export function getWeekdayFromDate(
  date: Date,
  format: "long" | "short" = "long",
): string {
  if (format === "short") {
    return formatDate(date).weekdayShort || "";
  }

  return formatDate(date).weekdayLong || "";
}
