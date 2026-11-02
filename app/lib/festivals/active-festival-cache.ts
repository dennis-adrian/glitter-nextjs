import "server-only";

import { eq } from "drizzle-orm";

import {
  expireSharedCache,
  reviveTimestamps,
  SHARED_CACHE_TAGS,
  sharedCache,
} from "@/app/lib/cache/shared";
import type { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { db } from "@/db";
import { festivalDates, festivals } from "@/db/schema";

/**
 * The festival in progress, shared across requests for up to a minute. The
 * navbar, the store's open state, Inicio and most participant pages ask for
 * it; it changes only through the festival actions, which expire it after
 * their write commits (`expireFestivalCaches`). The minute bounds a write
 * made anywhere else, such as a script.
 *
 * Only the festival row and its dates: sectors, stands and reservations change
 * all the time and are never cached here.
 */
const ACTIVE_FESTIVAL_LIFETIME_SECONDS = 60;

function reviveFestival<T extends object>(row: T): T {
  return reviveTimestamps(row, festivals);
}

export const readActiveFestivalBase = sharedCache(
  async () =>
    (await db.query.festivals.findFirst({
      where: eq(festivals.status, "active"),
    })) ?? null,
  "active-festival-base",
  {
    tags: [SHARED_CACHE_TAGS.festivals],
    revalidate: ACTIVE_FESTIVAL_LIFETIME_SECONDS,
    revive: (row) => (row ? reviveFestival(row) : row),
  },
);

export const readActiveFestivalWithDates = sharedCache(
  async (): Promise<FestivalWithDates | null> =>
    ((await db.query.festivals.findFirst({
      where: eq(festivals.status, "active"),
      with: { festivalDates: true },
    })) as FestivalWithDates | undefined) ?? null,
  "active-festival-with-dates",
  {
    tags: [SHARED_CACHE_TAGS.festivals],
    revalidate: ACTIVE_FESTIVAL_LIFETIME_SECONDS,
    revive: (row) =>
      row
        ? {
            ...reviveFestival(row),
            festivalDates: row.festivalDates.map((date) =>
              reviveTimestamps(date, festivalDates),
            ),
          }
        : row,
  },
);

/** Call after any write to a festival or its dates has committed. */
export function expireFestivalCaches() {
  expireSharedCache(SHARED_CACHE_TAGS.festivals);
}
