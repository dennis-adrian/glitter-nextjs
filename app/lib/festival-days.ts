import { DateTime } from "luxon";

import { STORE_TIMEZONE } from "@/app/lib/formatters";

/**
 * A festival's days as La Paz calendar days, deduped, sorted and split into
 * runs of consecutive days: 18, 19, 20 and 27 de diciembre become
 * [[18, 19, 20], [27]]. Every festival-date label builds on this, so a gap
 * between days never reads as one continuous range. Client-safe.
 */
export function festivalDayRuns(dates: readonly Date[]): DateTime[][] {
  const days = [
    ...new Set(
      dates.map((date) =>
        DateTime.fromJSDate(date, { zone: STORE_TIMEZONE }).toISODate(),
      ),
    ),
  ]
    .filter((day): day is string => day !== null)
    .sort()
    .map((day) => DateTime.fromISO(day).setLocale("es"));

  const runs: DateTime[][] = [];
  for (const day of days) {
    const run = runs[runs.length - 1];
    const previous = run?.[run.length - 1];
    if (previous && day.diff(previous, "days").days === 1) run.push(day);
    else runs.push([day]);
  }
  return runs;
}

/**
 * The days as a person says them: "14 de noviembre", "14 y 15 de noviembre",
 * "14 al 16 de noviembre", "12, 13 y 19 de diciembre", "18 al 20 y 27 de
 * diciembre", "30 de noviembre al 2 de diciembre". A run of three or more
 * days reads as a range; shorter runs list their days. A day carries its
 * month where the month changes and at the end of a range that crosses
 * months, the earlier part first. `year` adds the year once at the end.
 * Empty without days.
 */
export function formatFestivalDayRuns(
  runs: readonly DateTime[][],
  { year = false }: { year?: boolean } = {},
): string {
  // Each item is one day or a [start, end] range, in order.
  const items = runs.flatMap((run) =>
    run.length >= 3 ? [[run[0]!, run[run.length - 1]!]] : run.map((d) => [d]),
  );
  const points = items.flat();
  if (points.length === 0) return "";

  const sameMonth = (a: DateTime, b: DateTime | undefined) =>
    b !== undefined && a.month === b.month && a.year === b.year;
  let index = 0;
  const labels = items.map((item) =>
    item
      .map((day, i) => {
        const next = points[++index];
        // A range that crosses months names the month at its end too, so
        // "30 de noviembre al 2 de diciembre y 5 de diciembre" never reads
        // as "al 2 y 5".
        const crossedEnd = i === 1 && !sameMonth(item[0]!, day);
        return sameMonth(day, next) && !crossedEnd
          ? String(day.day)
          : day.toFormat("d 'de' LLLL");
      })
      .join(" al "),
  );
  const list =
    labels.length === 1
      ? labels[0]!
      : `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
  const last = points[points.length - 1]!;
  return year ? `${list} de ${last.year}` : list;
}
