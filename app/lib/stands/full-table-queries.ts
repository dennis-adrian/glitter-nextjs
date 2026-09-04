import "server-only";

import { and, eq } from "drizzle-orm";

import { summarizeFullTableAvailability } from "@/app/lib/reservations/full-table-access";
import {
  FULL_TABLE_CATEGORIES,
  type FullTableCategory,
} from "@/app/lib/stands/full-table-pairs";
import { db } from "@/db";
import { festivalSectors, standGroups } from "@/db/schema";

export type FullTableGroup = {
  id: number;
  /** Null until an admin prices it, which withholds it from participants. */
  fullTablePrice: number | null;
};

/**
 * A festival's declared full tables, with what each costs to book.
 *
 * The stands table already carries `standGroupId` on every row, so this small
 * list is all it needs to tell a full-table half from a plain visual group and
 * to show its price — cheaper than joining `stand_groups` into the sector query
 * that every other consumer shares.
 */
export async function fetchFullTableGroups(
  festivalId: number,
): Promise<FullTableGroup[]> {
  return db
    .select({
      id: standGroups.id,
      fullTablePrice: standGroups.fullTablePrice,
    })
    .from(standGroups)
    .innerJoin(
      festivalSectors,
      eq(festivalSectors.id, standGroups.festivalSectorId),
    )
    .where(
      and(
        eq(festivalSectors.festivalId, festivalId),
        eq(standGroups.type, "full_table"),
      ),
    );
}

export type FullTableReadiness = {
  /** Well-formed pairs an admin has priced. Only these are sellable. */
  declaredPairs: number;
  /** Priced but for the missing price — what is waiting on the admin. */
  unpricedPairs: number;
  /** Whether any priced pair has both halves free right now. */
  hasFreePair: boolean;
};

/**
 * What each full-table category still needs before participants see the offer.
 *
 * The same summary the participant-facing offer reads, so the admin screen
 * cannot report a state the map disagrees with. Every gate here is silent from
 * a participant's side — an unpriced pair or a half-taken one simply removes
 * the banner — which is why they are worth stating on the screen that controls
 * them.
 */
export async function fetchFullTableReadinessByCategory(
  festivalId: number,
): Promise<Record<FullTableCategory, FullTableReadiness>> {
  const entries = await Promise.all(
    FULL_TABLE_CATEGORIES.map(async (category) => {
      const summary = await summarizeFullTableAvailability(db, {
        festivalId,
        category,
      });
      return [
        category,
        {
          declaredPairs: summary.declaredPairs,
          unpricedPairs: summary.unpricedPairs,
          hasFreePair: summary.hasFreePair,
        },
      ] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<
    FullTableCategory,
    FullTableReadiness
  >;
}
