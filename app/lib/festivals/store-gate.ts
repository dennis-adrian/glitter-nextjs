import { DateTime } from "luxon";

import { STORE_TIMEZONE } from "@/app/lib/formatters";
import type { FestivalWithDates } from "./definitions";

/**
 * Pure check: does `now` fall inside the full-day span of any of the
 * festival's dates (evaluated in the store timezone)? Accepts `now` as a
 * parameter so the caller can read the current time under its own Next 16
 * dynamic-rendering context (e.g. after `await connection()`).
 */
export function isFestivalHappeningAt(
	festival: FestivalWithDates | null | undefined,
	now: Date,
): boolean {
	if (!festival?.festivalDates?.length) return false;

	const nowDT = DateTime.fromJSDate(now, { zone: STORE_TIMEZONE });
	return festival.festivalDates.some((d) => {
		const start = DateTime.fromJSDate(d.startDate, {
			zone: STORE_TIMEZONE,
		}).startOf("day");
		const end = DateTime.fromJSDate(d.endDate, {
			zone: STORE_TIMEZONE,
		}).endOf("day");
		return nowDT >= start && nowDT <= end;
	});
}
