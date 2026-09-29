import { formatDate, formatTime } from "@/app/lib/formatters";

/**
 * The text of the ink date stamp the programs pages share with the landing's
 * festival spotlight: a big day, a short month, and an optional third line.
 *
 * Pure and zone-fixed (`formatDate` reads in the store's zone), so a server
 * render and a client hydration print the same day wherever the browser is.
 */
export type DateStamp = {
  /** "7", or "7–9" for a range within one month. */
  primary: string;
  /** "OCT", or "SEPT–OCT" when a range crosses months. */
  secondary: string;
  /** The time or the year, depending on what was asked for. */
  tertiary: string | null;
  /** For `<time dateTime>`. */
  dateTime: string;
  /** What a screen reader hears instead of the stacked fragments. */
  label: string;
};

export type DateStampThirdLine = "time" | "year";

function shortMonth(date: ReturnType<typeof formatDate>): string {
  return date.toFormat("LLL").replace(".", "").toUpperCase();
}

export function buildDateStamp(
  start: Date | null,
  end: Date | null = null,
  third?: DateStampThirdLine,
): DateStamp | null {
  if (!start) return null;

  const from = formatDate(start);
  const to = end ? formatDate(end) : from;
  const sameDay = from.hasSame(to, "day");
  const sameMonth = from.hasSame(to, "month");

  const primary = sameDay
    ? from.toFormat("d")
    : `${from.toFormat("d")}–${to.toFormat("d")}`;
  const secondary = sameMonth
    ? shortMonth(to)
    : `${shortMonth(from)}–${shortMonth(to)}`;

  // formatTime keeps the app's explicit AM/PM, matching the booking rows.
  const time = formatTime(start);
  const tertiary =
    third === "time" ? time : third === "year" ? to.toFormat("yyyy") : null;

  const label = sameDay
    ? from.toFormat("d 'de' LLLL 'de' yyyy")
    : `del ${from.toFormat("d 'de' LLLL")} al ${to.toFormat("d 'de' LLLL 'de' yyyy")}`;

  return {
    primary,
    secondary,
    tertiary,
    dateTime: (third === "time" ? from.toISO() : from.toISODate()) ?? "",
    label: third === "time" ? `${label}, ${time}` : label,
  };
}
