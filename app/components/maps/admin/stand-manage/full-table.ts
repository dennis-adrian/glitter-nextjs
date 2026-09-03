import {
  type FullTablePairMember,
  type FullTablePairProblem,
  validateFullTablePair,
} from "@/app/lib/stands/full-table-pairs";

import type { StandRow } from "@/app/components/maps/admin/stand-manage/columns";

export type FullTableInfo = {
  groupId: number;
  /** The other half, when the group has exactly two members in this festival. */
  companion: StandRow | null;
  /** Every rule the declared pair currently breaks; empty when it is sound. */
  problems: FullTablePairProblem[];
};

function toPairMember(row: StandRow, festivalId: number): FullTablePairMember {
  return {
    id: row.id,
    label: row.label,
    standNumber: row.standNumber,
    festivalId,
    festivalSectorId: row.festivalSectorId,
    standCategory: row.standCategory,
    participationType: row.participationType,
    individualPrice: row.individualPrice,
    sharedPrice: row.sharedPrice,
    positionLeft: row.positionLeft,
    positionTop: row.positionTop,
    subcategoryIds: row.standSubcategories.map((link) => link.subcategoryId),
  };
}

/**
 * Full-table facts for every row, keyed by stand id.
 *
 * The same rules the server enforces are applied here so the table can warn
 * about a pair that has drifted — a price edit or an ungroup elsewhere can
 * invalidate a declaration long after it was made, and a broken pair is
 * invisible to participants: it silently withholds a full table from its whole
 * sector rather than failing loudly.
 *
 * Every row belongs to the festival being managed, so `festivalId` is passed in
 * rather than read off a stand, which does not carry one.
 */
export function indexFullTables(
  rows: StandRow[],
  fullTableGroupIds: readonly number[],
  festivalId: number,
): Map<number, FullTableInfo> {
  const declared = new Set(fullTableGroupIds);

  const byGroup = new Map<number, StandRow[]>();
  for (const row of rows) {
    if (row.standGroupId == null || !declared.has(row.standGroupId)) continue;
    const members = byGroup.get(row.standGroupId) ?? [];
    members.push(row);
    byGroup.set(row.standGroupId, members);
  }

  const index = new Map<number, FullTableInfo>();
  for (const [groupId, members] of byGroup) {
    const validation = validateFullTablePair(
      members.map((member) => toPairMember(member, festivalId)),
    );
    const problems = validation.ok ? [] : validation.problems;

    for (const member of members) {
      index.set(member.id, {
        groupId,
        companion: members.find((row) => row.id !== member.id) ?? null,
        problems,
      });
    }
  }

  return index;
}
