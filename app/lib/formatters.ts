import { DateTime } from "luxon";

/** Store timezone used for display and overdue logic (e.g. orders table). */
export const STORE_TIMEZONE = "America/La_Paz";

export function formatDate(date: Date | string): DateTime {
  if (date instanceof Date) {
    return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE }).setLocale("es");
  }

  const isoDate = DateTime.fromISO(date, { zone: STORE_TIMEZONE });
  if (isoDate.isValid) {
    return isoDate.setLocale("es");
  }

  const sqlDate = DateTime.fromSQL(date, { zone: STORE_TIMEZONE });
  if (sqlDate.isValid) {
    return sqlDate.setLocale("es");
  }

  return DateTime.invalid("unparsable");
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

export function slugify(input: string): string {
  return input
    .normalize("NFKD") // strip accents
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-z0-9]+/gi, "_") // replace non-alphanumeric with underscores
    .toLowerCase() // convert to lowercase
    .replace(/^_+|_+$/g, ""); // trim leading/trailing underscores
}

export const getFestivalDateString = (
  startDate: string | null,
  endDate: string | null,
) => {
  if (startDate && !endDate) {
    return startDate;
  }

  if (!startDate && endDate) {
    return endDate;
  }

  if (startDate === endDate) {
    return startDate;
  }

  return `${startDate} - ${endDate}`;
};
