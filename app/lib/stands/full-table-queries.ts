import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { festivalSectors, standGroups } from "@/db/schema";

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
