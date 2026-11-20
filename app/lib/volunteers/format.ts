import { DateTime } from "luxon";

import {
  festivalDayRuns,
  formatFestivalDayRuns,
} from "@/app/lib/festival-days";
import { STORE_TIMEZONE } from "@/app/lib/formatters";
import type {
  VolunteerInduction,
  VolunteerShift,
} from "@/app/lib/volunteers/definitions";

/**
 * How shifts, dates and the induction read in Spanish, on La Paz's clock.
 * Client-safe: the page, the form and the email all use these.
 */

function laPaz(date: Date) {
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE }).setLocale("es");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "Vie 18 dic" */
export function formatShiftDay(date: Date): string {
  const day = laPaz(date);
  const weekday = capitalize(day.toFormat("ccc").replace(".", ""));
  const month = day.toFormat("LLL").replace(".", "");
  return `${weekday} ${day.day} ${month}`;
}

/** "15:00–19:00" */
export function formatShiftHours(
  shift: Pick<VolunteerShift, "startsAt" | "endsAt">,
): string {
  return `${laPaz(shift.startsAt).toFormat("HH:mm")}–${laPaz(shift.endsAt).toFormat("HH:mm")}`;
}

/** "Vie 18 dic · 15:00–19:00" */
export function formatShiftWhen(
  shift: Pick<VolunteerShift, "startsAt" | "endsAt">,
): string {
  return `${formatShiftDay(shift.startsAt)} · ${formatShiftHours(shift)}`;
}

/** "Vie 18 · 15:00–19:00", for the short review list. */
export function formatShiftWhenShort(
  shift: Pick<VolunteerShift, "startsAt" | "endsAt">,
): string {
  const day = laPaz(shift.startsAt);
  const weekday = capitalize(day.toFormat("ccc").replace(".", ""));
  return `${weekday} ${day.day} · ${formatShiftHours(shift)}`;
}

/** "Vie 18 dic · 15:00–19:00 — Montaje" */
export function formatShiftSummary(shift: VolunteerShift): string {
  return `${formatShiftWhen(shift)} — ${shift.label}`;
}

/**
 * The closing instant on La Paz's clock: "lunes 30 de noviembre", "23:59",
 * and "30 de noviembre" for the short mentions.
 */
export function formatCloseDate(date: Date) {
  const close = laPaz(date);
  return {
    weekdayDate: close.toFormat("cccc d 'de' LLLL"),
    time: close.toFormat("HH:mm"),
    date: close.toFormat("d 'de' LLLL"),
  };
}

/**
 * The festival's date tile: "19–20" over "dic 2026". Consecutive days join
 * with a dash and separate runs with a comma, so 18–20 and 27 de diciembre
 * read "18–20, 27"; a day before a month change names its month ("30 nov–1").
 * Null without dates.
 */
export function formatFestivalDateTile(
  dates: Date[],
): { days: string; monthYear: string } | null {
  const runs = festivalDayRuns(dates);
  if (runs.length === 0) return null;
  const points = runs.flatMap((run) =>
    run.length === 1 ? [run] : [[run[0]!, run[run.length - 1]!]],
  );
  const all = points.flat();
  let index = 0;
  const label = (day: DateTime) => {
    const next = all[++index];
    return !next || (next.month === day.month && next.year === day.year)
      ? String(day.day)
      : `${day.day} ${shortMonth(day)}`;
  };
  const last = all[all.length - 1]!;
  return {
    days: points.map((run) => run.map(label).join("–")).join(", "),
    monthYear: `${shortMonth(last)} ${last.year}`,
  };
}

function shortMonth(day: DateTime) {
  return day.toFormat("LLL").replace(".", "");
}

/** "viernes 18 de diciembre", the setup day mentioned in the hero. */
export function formatWeekdayDate(date: Date): string {
  return laPaz(date).toFormat("cccc d 'de' LLLL");
}

/**
 * "sábado 5 de diciembre", or "sábado 5 de diciembre, 18:00" once the time
 * is set. The date is already La Paz's, so no zone conversion applies.
 */
export function formatInduction(induction: VolunteerInduction): string {
  const day = DateTime.fromISO(induction.date)
    .setLocale("es")
    .toFormat("cccc d 'de' LLLL");
  const time = induction.time?.slice(0, 5);
  return time ? `${day}, ${time}` : day;
}

/**
 * The festival's days with the year: "19 de diciembre de 2026", "19 y 20 de
 * diciembre de 2026", "18 al 20 y 27 de diciembre de 2026". Null without dates.
 */
export function formatFestivalDays(dates: Date[]): string | null {
  return formatFestivalDayRuns(festivalDayRuns(dates), { year: true }) || null;
}
