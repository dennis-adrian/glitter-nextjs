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

  // A date and a time are formatted apart and joined with a comma. Asked for
  // together, ICU picks the joiner from its locale data, and that changes
  // between versions and month widths: newer data writes "25 de octubre a
  // las 10:12 AM" where older data writes "25 de octubre, 10:12 AM". The
  // server's Node and each browser carry their own data, so the same date
  // could render two ways, and differ between server and hydration.
  const { date: dateOptions, time: timeOptions } = splitDateTimeOptions(options);
  if (dateOptions && timeOptions) {
    return `${formatParts(date, dateOptions)}, ${formatParts(date, timeOptions)}`;
  }
  return formatParts(date, options);
}

function formatParts(date: DateTime, options: Intl.DateTimeFormatOptions) {
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

const DATE_FIELDS = ["weekday", "era", "year", "month", "day"] as const;
const TIME_FIELDS = [
  "hour",
  "minute",
  "second",
  "fractionalSecondDigits",
  "dayPeriod",
] as const;

/** Settings that only shape a time; every other non-field setting is shared. */
const TIME_ONLY_SETTINGS = ["hourCycle", "hour12", "timeZoneName"] as const;

/**
 * The date half and the time half of `options`, when it asks for both;
 * otherwise nulls, and the options are used as they are. Settings that shape
 * both halves (calendar, numbering system) go to each; those that only shape
 * a time go with the time.
 */
function splitDateTimeOptions(options: Intl.DateTimeFormatOptions): {
  date: Intl.DateTimeFormatOptions | null;
  time: Intl.DateTimeFormatOptions | null;
} {
  const shared: Record<string, unknown> = {};
  const dateOnly: Record<string, unknown> = {};
  const timeOnly: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    if (key === "dateStyle" || (DATE_FIELDS as readonly string[]).includes(key)) {
      dateOnly[key] = value;
    } else if (
      key === "timeStyle" ||
      (TIME_FIELDS as readonly string[]).includes(key) ||
      (TIME_ONLY_SETTINGS as readonly string[]).includes(key)
    ) {
      timeOnly[key] = value;
    } else {
      shared[key] = value;
    }
  }

  const hasDate = Object.keys(dateOnly).length > 0;
  const hasTime = Object.keys(timeOnly).some(
    (key) =>
      key === "timeStyle" || (TIME_FIELDS as readonly string[]).includes(key),
  );
  if (!hasDate || !hasTime) return { date: null, time: null };

  return {
    date: { ...shared, ...dateOnly } as Intl.DateTimeFormatOptions,
    time: { ...shared, ...timeOnly } as Intl.DateTimeFormatOptions,
  };
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
