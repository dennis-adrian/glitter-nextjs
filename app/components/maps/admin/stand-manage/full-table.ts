import {
  type FullTablePairMember,
  type FullTablePairProblem,
  validateFullTablePair,
} from "@/app/lib/stands/full-table-pairs";
import { occupiesStandCapacity } from "@/app/lib/reservations/policy";

import type { StandRow } from "@/app/components/maps/admin/stand-manage/columns";
import type { FullTableGroup } from "@/app/lib/stands/full-table-queries";

export type FullTableInfo = {
  groupId: number;
  /** The other half, when the group has exactly two members in this festival. */
  companion: StandRow | null;
  /** Every rule the declared pair currently breaks; empty when it is sound. */
  problems: FullTablePairProblem[];
  /** What booking the whole table costs; null withholds it from participants. */
  fullTablePrice: number | null;
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
  fullTableGroups: readonly FullTableGroup[],
  festivalId: number,
): Map<number, FullTableInfo> {
  const priceByGroup = new Map(
    fullTableGroups.map((group) => [group.id, group.fullTablePrice]),
  );
  const declared = new Set(fullTableGroups.map((group) => group.id));

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
        fullTablePrice: priceByGroup.get(groupId) ?? null,
      });
    }
  }

  return index;
}

type BookableRow = {
  id: number;
  reservations: readonly { id: number; status: string }[];
};

/** Rows list every reservation ever made on the stand, cancelled ones too. */
export function isBookedRow(row: BookableRow): boolean {
  return row.reservations.some((reservation) =>
    occupiesStandCapacity(reservation.status),
  );
}

/**
 * The selected rows carrying a live reservation that occupies more than one
 * stand — the client half of the server's BOOKED_AS_TABLE.
 *
 * Counted over every row, not just the selection, because the server counts
 * all of the reservation's live members. Rows are resolved through
 * membership, so a two-stand reservation appears on both of its stands.
 */
export function rowsBookedAsTable<T extends BookableRow>(
  selected: readonly T[],
  allRows: Iterable<BookableRow>,
): T[] {
  const standsByReservation = new Map<number, number>();
  for (const row of allRows) {
    for (const reservation of row.reservations) {
      if (!occupiesStandCapacity(reservation.status)) continue;
      standsByReservation.set(
        reservation.id,
        (standsByReservation.get(reservation.id) ?? 0) + 1,
      );
    }
  }
  return selected.filter((row) =>
    row.reservations.some(
      (reservation) =>
        occupiesStandCapacity(reservation.status) &&
        (standsByReservation.get(reservation.id) ?? 0) > 1,
    ),
  );
}

export type FullTablePriceSelection =
  | { groupIds: number[]; reason: null }
  | { groupIds: []; reason: string };

/**
 * Which full tables a "Precio de la mesa completa" edit would reprice, or why
 * the selection cannot take one.
 *
 * Every selected stand has to be a half of some table: a selection that also
 * holds a stand outside any table is ambiguous — the admin may expect the
 * price to reach that stand too — so it is refused rather than silently
 * narrowed. Picking one half is enough to reach its table, which is what lets
 * an admin select a whole row of tables and price them in one step.
 */
export function fullTablePriceSelection(
  selectedIds: readonly number[],
  fullTableByStandId: ReadonlyMap<number, Pick<FullTableInfo, "groupId">>,
): FullTablePriceSelection {
  const groupIds = new Set<number>();
  let outside = 0;
  for (const id of selectedIds) {
    const groupId = fullTableByStandId.get(id)?.groupId;
    if (groupId == null) outside += 1;
    else groupIds.add(groupId);
  }

  if (groupIds.size === 0) {
    return {
      groupIds: [],
      reason: "Ningún espacio seleccionado es mitad de una mesa completa.",
    };
  }
  if (outside > 0) {
    return {
      groupIds: [],
      reason:
        outside === 1
          ? "Hay un espacio seleccionado que no es parte de una mesa completa."
          : `Hay ${outside} espacios seleccionados que no son parte de una mesa completa.`,
    };
  }
  return { groupIds: [...groupIds].sort((a, b) => a - b), reason: null };
}
