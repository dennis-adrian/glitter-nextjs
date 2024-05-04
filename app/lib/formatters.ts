import { DateTime } from "luxon";

export function formatDate(date: Date): DateTime {
  return DateTime.fromISO(date.toISOString(), {
    zone: "America/La_Paz",
  });
}

export function formatDateToTimezone(date: Date): Date {
  return new Date(date.getTime() - 4 * 60 * 60 * 1000);
}

export function formatFullDate(date: Date): string {
  const dateFormatter = new Intl.DateTimeFormat("es-Es", {
    timeZone: "Etc/GMT",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  date = date || new Date();

  return dateFormatter.format(date);
}

export function getWeekdayFromDate(
  date: Date,
  format: "long" | "short" | "narrow" = "long",
): string {
  const dateFormatter = new Intl.DateTimeFormat("es-Es", {
    timeZone: "Etc/GMT",
    weekday: format,
  });
  date = date || new Date();

  return dateFormatter.format(date);
}
