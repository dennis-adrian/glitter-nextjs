import "server-only";

import { and, eq } from "drizzle-orm";

import type { FullTableCategory } from "@/app/lib/stands/full-table-pairs";
import { db } from "@/db";
import { festivalSectors, standGroups, stands } from "@/db/schema";

/**
 * Which of a festival's stand groups are declared full tables.
 *
 * The stands table already carries `standGroupId` on every row, so this one set
 * is all it needs to tell a full-table half from a plain visual group — cheaper
 * than joining `stand_groups` into the sector query that every other consumer
 * shares.
 */
export async function fetchFullTableGroupIds(
  festivalId: number,
): Promise<number[]> {
  const rows = await db
    .select({ id: standGroups.id })
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

  return rows.map((row) => row.id);
}

/**
 * How many full tables a festival has declared, per category.
 *
 * Enabling and pricing the feature is not enough to make it appear: an offer is
 * withheld when the category has no declared table to sell, which from the
 * admin panel is invisible — the switch reads as on and participants see
 * nothing. This is what lets the panel say so.
 *
 * Only two-member groups count, matching what participants can actually be
 * sold; a malformed group is inventory nobody can take.
 */
export async function countDeclaredFullTablesByCategory(
  festivalId: number,
): Promise<Record<FullTableCategory, number>> {
  const rows = await db
    .select({
      groupId: standGroups.id,
      standCategory: stands.standCategory,
    })
    .from(stands)
    .innerJoin(standGroups, eq(standGroups.id, stands.standGroupId))
    .where(
      and(
        eq(stands.festivalId, festivalId),
        eq(standGroups.type, "full_table"),
      ),
    );

  const membersByGroup = new Map<number, string[]>();
  for (const row of rows) {
    membersByGroup.set(row.groupId, [
      ...(membersByGroup.get(row.groupId) ?? []),
      row.standCategory,
    ]);
  }

  const counts: Record<FullTableCategory, number> = {
    illustration: 0,
    entrepreneurship: 0,
  };
  for (const categories of membersByGroup.values()) {
    if (categories.length !== 2) continue;
    const [first, second] = categories;
    if (first !== second) continue;
    if (first === "illustration" || first === "entrepreneurship") {
      counts[first] += 1;
    }
  }
  return counts;
}
