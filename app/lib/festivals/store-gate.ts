import { DateTime } from "luxon";

import { STORE_TIMEZONE } from "@/app/lib/formatters";
import type { StoreStatusMode } from "@/app/lib/store_settings/definitions";
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

export type StoreClosure =
  | { closed: false }
  | {
      closed: true;
      source: "manual";
      title: string | null;
      message: string | null;
    }
  | { closed: true; source: "festival"; festival: FestivalWithDates };

/**
 * Resolves whether the storefront is closed, honoring the admin override first:
 * `closed`/`open` force the result, `auto` falls back to the festival-based
 * auto-close (closed while a festival is happening unless `keepStoreOpen`).
 */
export function resolveStoreClosure({
  mode,
  closedTitle,
  closedMessage,
  festival,
  now,
}: {
  mode: StoreStatusMode;
  closedTitle: string | null;
  closedMessage: string | null;
  festival: FestivalWithDates | null | undefined;
  now: Date;
}): StoreClosure {
  if (mode === "closed") {
    return {
      closed: true,
      source: "manual",
      title: closedTitle,
      message: closedMessage,
    };
  }

  if (mode === "open") {
    return { closed: false };
  }

  // mode === "auto": keep the existing festival behavior.
  if (
    festival &&
    !festival.keepStoreOpen &&
    isFestivalHappeningAt(festival, now)
  ) {
    return { closed: true, source: "festival", festival };
  }

  return { closed: false };
}
