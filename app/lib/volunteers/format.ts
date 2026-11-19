import { DateTime } from "luxon";

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

/** The festival's date tile: "19–20" over "dic 2026". Null without dates. */
export function formatFestivalDateTile(
  dates: Date[],
): { days: string; monthYear: string } | null {
  const days = [...new Set(dates.map((date) => laPaz(date).toISODate()))]
    .filter((day): day is string => day !== null)
    .sort()
    .map((day) => DateTime.fromISO(day).setLocale("es"));
  if (days.length === 0) return null;
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const sameMonth = first.month === last.month && first.year === last.year;
  const range =
    days.length === 1
      ? String(first.day)
      : sameMonth
        ? `${first.day}–${last.day}`
        : `${first.day} ${first.toFormat("LLL").replace(".", "")}–${last.day}`;
  return {
    days: range,
    monthYear: `${last.toFormat("LLL").replace(".", "")} ${last.year}`,
  };
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

/** The festival's days: "19 de diciembre", "19 y 20 de diciembre", "30 de noviembre al 1 de diciembre". */
export function formatFestivalDays(dates: Date[]): string | null {
  const days = [...new Set(dates.map((date) => laPaz(date).toISODate()))]
    .filter((day): day is string => day !== null)
    .sort();
  if (days.length === 0) return null;
  const first = DateTime.fromISO(days[0]!).setLocale("es");
  const last = DateTime.fromISO(days[days.length - 1]!).setLocale("es");
  const lastLabel = last.toFormat("d 'de' LLLL 'de' yyyy");
  if (days.length === 1) return lastLabel;
  const joiner = days.length === 2 ? " y " : " al ";
  const firstLabel =
    first.month === last.month
      ? String(first.day)
      : first.toFormat("d 'de' LLLL");
  return `${firstLabel}${joiner}${lastLabel}`;
}
