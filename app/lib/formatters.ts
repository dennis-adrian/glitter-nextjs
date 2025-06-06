import { DateTime } from "luxon";

export function formatDate(date: Date | string): DateTime {
  const isoDate = date instanceof Date ? date.toISOString() : date;
  return DateTime.fromISO(isoDate, {
    zone: "America/La_Paz",
  }).setLocale("es");
}

export function formatFullDate(
  date: Date | null | undefined,
  format = DateTime.DATE_FULL,
): string {
  if (!date) return "";

  return formatDate(date).toLocaleString(format);
}

export function formatDateWithTime(date: Date): string {
  return formatDate(date).toFormat("ff");
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
