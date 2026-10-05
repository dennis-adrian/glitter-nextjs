import "server-only";

import { eq, inArray } from "drizzle-orm";

import { lockStandRows, uniqueSortedIds } from "@/app/lib/reservations/locks";
import { standsHaveReservations } from "@/app/lib/reservations/members";
import { resolveJointAxis } from "@/app/lib/stands/groups";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { db } from "@/db";
import { standGroups, stands } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type StandGroupType = (typeof standGroups.$inferSelect)["type"];

/**
 * Drops groups that no longer have at least two members.
 *
 * Any command that moves a stand out of a group has to run this, so it lives
 * here rather than inside one of them: a one-member group is invisible on the
 * map and would silently outlive whatever created it.
 *
 * It deletes whatever type the group is, so the caller must already hold the
 * groups and every member stand (`lockStandGroupScope`) and have refused any
 * full table it was not asked to dismantle. The delete's ON DELETE SET NULL
 * writes the surviving members, which is why they have to be locked too.
 */
export async function pruneEmptyGroups(tx: DbTx, groupIds: number[]) {
  if (groupIds.length === 0) return;
  const remaining = await tx
    .select({ id: stands.id, standGroupId: stands.standGroupId })
    .from(stands)
    .where(inArray(stands.standGroupId, groupIds));

  const counts = new Map<number, number>();
  for (const row of remaining) {
    if (row.standGroupId == null) continue;
    counts.set(row.standGroupId, (counts.get(row.standGroupId) ?? 0) + 1);
  }

  const stale = groupIds.filter((id) => (counts.get(id) ?? 0) < 2);
  if (stale.length === 0) return;

  // The stands FK is ON DELETE SET NULL, so the last member is released here.
  await tx.delete(standGroups).where(inArray(standGroups.id, stale));
}

/**
 * Locks the given `stand_groups` rows in ascending id order and returns their
 * types, read by the locking statement itself so a type changed while waiting
 * is the one returned.
 *
 * Groups are locked before stands everywhere a group is written; taking the
 * two tables in opposite orders is how two commands on the same table would
 * deadlock.
 */
export async function lockStandGroupRows(
  tx: DbTx,
  groupIds: readonly number[],
): Promise<Map<number, StandGroupType>> {
  const types = new Map<number, StandGroupType>();
  for (const groupId of uniqueSortedIds(groupIds)) {
    const [group] = await tx
      .select({ type: standGroups.type })
      .from(standGroups)
      .where(eq(standGroups.id, groupId))
      .limit(1)
      .for("update");
    if (group) types.set(groupId, group.type);
  }
  return types;
}

export type ScopedStand = {
  id: number;
  label: string | null;
  standNumber: number;
  festivalSectorId: number | null;
  positionLeft: number | null;
  positionTop: number | null;
  standGroupId: number | null;
};

export type StandGroupScope = {
  /** The requested stands that still exist, read under their locks. */
  stands: ScopedStand[];
  /** Every group those stands belonged to, locked, with its type. */
  groupTypes: Map<number, StandGroupType>;
};

/**
 * Locks everything a change to these stands' grouping can touch: the groups
 * they belong to, then those stands plus every other member of those groups.
 *
 * Members are included because `pruneEmptyGroups` writes the survivors of a
 * group it deletes. Once a group is held FOR UPDATE nobody can attach a stand
 * to it — that write needs a key-share lock on the group row — so its member
 * list read after the lock is the one that holds.
 *
 * Returns CHANGED when one of the stands moved to a group that was not locked
 * between the unlocked preview and the stand locks: locking that group now
 * would take a group after a stand. Only two admin writes racing get there.
 */
export async function lockStandGroupScope(
  tx: DbTx,
  standIds: readonly number[],
): Promise<
  { ok: true; scope: StandGroupScope } | { ok: false; code: "CHANGED" }
> {
  const ids = uniqueSortedIds(standIds);
  if (ids.length === 0) {
    return { ok: true, scope: { stands: [], groupTypes: new Map() } };
  }

  const preview = await tx
    .select({ standGroupId: stands.standGroupId })
    .from(stands)
    .where(inArray(stands.id, ids));
  const groupTypes = await lockStandGroupRows(
    tx,
    preview
      .map((row) => row.standGroupId)
      .filter((id): id is number => id != null),
  );

  const members =
    groupTypes.size === 0
      ? []
      : await tx
          .select({ id: stands.id })
          .from(stands)
          .where(inArray(stands.standGroupId, [...groupTypes.keys()]));
  await lockStandRows(tx, [...ids, ...members.map((row) => row.id)]);

  const locked = await tx
    .select({
      id: stands.id,
      label: stands.label,
      standNumber: stands.standNumber,
      festivalSectorId: stands.festivalSectorId,
      positionLeft: stands.positionLeft,
      positionTop: stands.positionTop,
      standGroupId: stands.standGroupId,
    })
    .from(stands)
    .where(inArray(stands.id, ids));
  if (
    locked.some(
      (row) => row.standGroupId != null && !groupTypes.has(row.standGroupId),
    )
  ) {
    return { ok: false, code: "CHANGED" };
  }

  return { ok: true, scope: { stands: locked, groupTypes } };
}

/** The selected stands that are half of a declared full table. */
function fullTableHalves(scope: StandGroupScope) {
  return scope.stands.filter(
    (stand) =>
      stand.standGroupId != null &&
      scope.groupTypes.get(stand.standGroupId) === "full_table",
  );
}

type FullTableMemberRefusal = {
  ok: false;
  code: "FULL_TABLE_MEMBER";
  fullTableStandLabels: string[];
};

function fullTableMemberRefusal(halves: ScopedStand[]): FullTableMemberRefusal {
  return {
    ok: false,
    code: "FULL_TABLE_MEMBER",
    fullTableStandLabels: halves.map(formatStandLabel),
  };
}

export type CreateVisualGroupResult =
  | { ok: true; groupId: number }
  | FullTableMemberRefusal
  | {
      ok: false;
      code:
        | "TOO_FEW_STANDS"
        | "STANDS_NOT_FOUND"
        | "NO_SECTOR"
        | "SECTOR_MISMATCH"
        | "NOT_PLACED_ON_MAP"
        | "NOT_ALIGNED"
        | "CHANGED";
    };

/**
 * Declares the given stands as one physical unit. Grouping is deliberately
 * manual: map coordinates are placed freehand, so adjacency cannot be inferred.
 *
 * A half of a declared full table is refused. Re-parenting it would leave its
 * table with one member, which pruning then deletes along with its price —
 * a split that skipped every rule `dissolveFullTablePair` applies.
 */
export async function createVisualGroup(input: {
  standIds: readonly number[];
}): Promise<CreateVisualGroupResult> {
  const standIds = uniqueSortedIds(input.standIds);
  if (standIds.length < 2) return { ok: false, code: "TOO_FEW_STANDS" };

  return db.transaction(async (tx): Promise<CreateVisualGroupResult> => {
    const locked = await lockStandGroupScope(tx, standIds);
    if (!locked.ok) return locked;
    const { scope } = locked;

    if (scope.stands.length !== standIds.length) {
      return { ok: false, code: "STANDS_NOT_FOUND" };
    }
    const halves = fullTableHalves(scope);
    if (halves.length > 0) return fullTableMemberRefusal(halves);

    const sectorId = scope.stands[0].festivalSectorId;
    if (sectorId == null) return { ok: false, code: "NO_SECTOR" };
    if (scope.stands.some((stand) => stand.festivalSectorId !== sectorId)) {
      return { ok: false, code: "SECTOR_MISMATCH" };
    }
    if (
      scope.stands.some(
        (stand) => stand.positionLeft == null || stand.positionTop == null,
      )
    ) {
      return { ok: false, code: "NOT_PLACED_ON_MAP" };
    }
    if (resolveJointAxis(scope.stands) === null) {
      return { ok: false, code: "NOT_ALIGNED" };
    }

    const [group] = await tx
      .insert(standGroups)
      .values({ festivalSectorId: sectorId })
      .returning({ id: standGroups.id });

    await tx
      .update(stands)
      .set({ standGroupId: group.id, updatedAt: new Date() })
      .where(inArray(stands.id, standIds));

    await pruneEmptyGroups(tx, [...scope.groupTypes.keys()]);
    return { ok: true, groupId: group.id };
  });
}

export type UngroupVisualStandsResult =
  | { ok: true }
  | FullTableMemberRefusal
  | { ok: false; code: "NOT_GROUPED" | "CHANGED" };

/**
 * Releases the given stands from whatever visual group they belong to.
 *
 * A selection that touches a declared full table is refused whole, mixed ones
 * included: tables are split by `dissolveFullTablePair`, which refuses a table
 * someone is booking or has booked as a whole.
 */
export async function ungroupVisualStands(input: {
  standIds: readonly number[];
}): Promise<UngroupVisualStandsResult> {
  const standIds = uniqueSortedIds(input.standIds);

  return db.transaction(async (tx): Promise<UngroupVisualStandsResult> => {
    const locked = await lockStandGroupScope(tx, standIds);
    if (!locked.ok) return locked;
    const { scope } = locked;

    if (scope.groupTypes.size === 0) return { ok: false, code: "NOT_GROUPED" };
    const halves = fullTableHalves(scope);
    if (halves.length > 0) return fullTableMemberRefusal(halves);

    await tx
      .update(stands)
      .set({ standGroupId: null, updatedAt: new Date() })
      .where(inArray(stands.id, standIds));

    await pruneEmptyGroups(tx, [...scope.groupTypes.keys()]);
    return { ok: true };
  });
}

export type DeleteStandsResult =
  | { ok: true; deleted: number }
  | FullTableMemberRefusal
  | { ok: false; code: "HAS_RESERVATIONS" | "CHANGED" };

/**
 * Deletes stands, refusing any that is reserved or half of a declared table.
 *
 * Deleting one half would leave its table with a single member; the stand
 * foreign keys would also cascade a live hold's member row away, so a held
 * table would confirm as one stand. The groups the stands leave are pruned.
 */
export async function deleteStandsWithGroups(input: {
  standIds: readonly number[];
}): Promise<DeleteStandsResult> {
  const standIds = uniqueSortedIds(input.standIds);

  return db.transaction(async (tx): Promise<DeleteStandsResult> => {
    const locked = await lockStandGroupScope(tx, standIds);
    if (!locked.ok) return locked;
    const { scope } = locked;

    // Membership as well as the parent column: a full table's companion is
    // reachable only through membership, so checking `stand_id` alone let the
    // delete through and the foreign key rejected it with a generic error.
    if (await standsHaveReservations(tx, standIds)) {
      return { ok: false, code: "HAS_RESERVATIONS" };
    }
    const halves = fullTableHalves(scope);
    if (halves.length > 0) return fullTableMemberRefusal(halves);

    const existingIds = scope.stands.map((stand) => stand.id);
    if (existingIds.length > 0) {
      await tx.delete(stands).where(inArray(stands.id, existingIds));
    }
    await pruneEmptyGroups(tx, [...scope.groupTypes.keys()]);
    return { ok: true, deleted: existingIds.length };
  });
}
