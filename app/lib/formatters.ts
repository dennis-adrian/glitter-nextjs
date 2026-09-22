import { DateTime } from "luxon";

/** Store timezone used for display and overdue logic (e.g. orders table). */
export const STORE_TIMEZONE = "America/La_Paz";

type DisplayDate = Date | string | DateTime;

/** Spanish dates, Bolivia time, and explicit AM/PM on every displayed time. */
export function formatDisplayDate(
  value: DisplayDate,
  options: Intl.DateTimeFormatOptions = DateTime.DATE_MED,
): string {
  const date = DateTime.isDateTime(value)
    ? value.setZone(STORE_TIMEZONE).setLocale("es")
    : formatDate(value);
  if (!date.isValid) return "—";

  return new Intl.DateTimeFormat("es", {
    ...options,
    timeZone: STORE_TIMEZONE,
    hour12: true,
  })
    .formatToParts(date.toJSDate())
    .map((part) => {
      if (part.type === "dayPeriod") return date.hour < 12 ? "AM" : "PM";
      return part.value.replace(/[\u00a0\u202f]/g, " ");
    })
    .join("");
}

export function formatDateTime(
  value: DisplayDate,
  options: Intl.DateTimeFormatOptions = DateTime.DATETIME_MED,
): string {
  return formatDisplayDate(value, options);
}

export function formatTime(
  value: DisplayDate,
  options: Intl.DateTimeFormatOptions = DateTime.TIME_SIMPLE,
): string {
  return formatDisplayDate(value, options);
}

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

/** Like `formatDate`, but returns null for invalid Luxon DateTimes (which are still truthy objects). */
export function formatDateOrNull(date: Date | string): DateTime | null {
  const formatted = formatDate(date);
  return formatted.isValid ? formatted : null;
}

export function formatFullDate(
  date: Date | null | undefined,
  format = DateTime.DATE_FULL,
): string {
  if (!date) return "";

  return formatDisplayDate(date, format);
}

export function formatDateWithTime(date: Date): string {
  return formatDateTime(date);
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

/**
 * Bolivianos as an admin reads them: no decimals on a whole number, exactly
 * two when there are any.
 *
 * Several dialogs interpolated `Bs{amount}` directly, so a cobro of 370.5
 * rendered "Bs370.5" beside a table that said "Bs370,50".
 */
export function formatMoney(amount: number): string {
  return `Bs${amount.toLocaleString("es-BO", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
