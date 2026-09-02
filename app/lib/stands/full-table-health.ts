/**
 * Read-only full-table pair health checks.
 *
 * Deliberately free of `import "server-only"`: the invariant report is a plain
 * `tsx` CLI, and that import throws outside a Next build. The mutating command
 * lives in `full-table-service.ts`, which keeps the guard.
 */
import { eq, inArray } from "drizzle-orm";

import {
  type FullTablePairMember,
  type FullTablePairProblem,
  validateFullTablePair,
} from "@/app/lib/stands/full-table-pairs";
import { db } from "@/db";
import {
  festivalSectors,
  standGroups,
  standSubcategories,
  stands,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Reads a group's stands with everything the pairing rules need. Kept separate
 * so the health report can reuse it outside a write transaction.
 */
export async function loadStandGroupMembers(
  tx: DbTx,
  groupId: number,
): Promise<FullTablePairMember[]> {
  const rows = await tx
    .select({
      id: stands.id,
      label: stands.label,
      standNumber: stands.standNumber,
      festivalSectorId: stands.festivalSectorId,
      festivalId: festivalSectors.festivalId,
      standCategory: stands.standCategory,
      participationType: stands.participationType,
      individualPrice: stands.individualPrice,
      sharedPrice: stands.sharedPrice,
      positionLeft: stands.positionLeft,
      positionTop: stands.positionTop,
    })
    .from(stands)
    .leftJoin(festivalSectors, eq(festivalSectors.id, stands.festivalSectorId))
    .where(eq(stands.standGroupId, groupId));

  if (rows.length === 0) return [];

  const standIds = rows.map((row) => row.id);
  const subcategoryRows = await tx
    .select({
      standId: standSubcategories.standId,
      subcategoryId: standSubcategories.subcategoryId,
    })
    .from(standSubcategories)
    .where(inArray(standSubcategories.standId, standIds));

  const byStand = new Map<number, number[]>();
  for (const row of subcategoryRows) {
    byStand.set(row.standId, [
      ...(byStand.get(row.standId) ?? []),
      row.subcategoryId,
    ]);
  }

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    standNumber: row.standNumber,
    festivalId: row.festivalId,
    festivalSectorId: row.festivalSectorId,
    standCategory: row.standCategory,
    participationType: row.participationType,
    individualPrice: Number(row.individualPrice),
    sharedPrice: row.sharedPrice == null ? null : Number(row.sharedPrice),
    positionLeft: row.positionLeft,
    positionTop: row.positionTop,
    subcategoryIds: byStand.get(row.id) ?? [],
  }));
}

export type MalformedFullTableGroup = {
  groupId: number;
  festivalSectorId: number;
  problems: FullTablePairProblem[];
};

/**
 * Every group already marked `full_table` that no longer satisfies the rules —
 * a price edit or an ungroup can invalidate a pair long after it was declared.
 */
export async function findMalformedFullTableGroups(): Promise<
  MalformedFullTableGroup[]
> {
  const groups = await db
    .select({
      id: standGroups.id,
      festivalSectorId: standGroups.festivalSectorId,
    })
    .from(standGroups)
    .where(eq(standGroups.type, "full_table"));

  if (groups.length === 0) return [];

  // One transaction so every group is judged against the same snapshot; a
  // concurrent price edit must not make the report contradict itself.
  return db.transaction(async (tx) => {
    const malformed: MalformedFullTableGroup[] = [];
    for (const group of groups) {
      const members = await loadStandGroupMembers(tx, group.id);
      const validation = validateFullTablePair(members);
      if (!validation.ok) {
        malformed.push({
          groupId: group.id,
          festivalSectorId: group.festivalSectorId,
          problems: validation.problems,
        });
      }
    }
    return malformed;
  });
}
