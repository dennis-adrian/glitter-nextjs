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

export function slugify(input: string): string {
  return input
    .normalize("NFKD")             // strip accents
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics
    .replace(/[^a-z0-9]+/gi, "_")   // replace non-alphanumeric with underscores
    .toLowerCase()                  // convert to lowercase
    .replace(/^_+|_+$/g, "");       // trim leading/trailing underscores
}

export const getFestivalDateString = (
	startDate: string | null,
	endDate: string | null,
) => {
	if (!(startDate && endDate)) return null;

	if (startDate === endDate) {
		return startDate;
	}

	if (startDate && !endDate) {
		return startDate;
	}

	if (!startDate && endDate) {
		return endDate;
	}

	return `${startDate} - ${endDate}`;
};
