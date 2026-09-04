import "server-only";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { OCCUPYING_RESERVATION_STATUSES } from "@/app/lib/reservations/members";
import { db } from "@/db";
import {
  reservationFeatureActions,
  standGroups,
  standHoldMembers,
  standHolds,
  standReservationStands,
  stands,
} from "@/db/schema";

import {
  FULL_TABLE_CATEGORIES,
  type FullTableCategory,
} from "@/app/lib/stands/full-table-pairs";

/**
 * Whether a participant category may ever hold full-table access.
 *
 * Callers use this to skip the access lookup entirely, which is the common
 * case: gastronomy and new-artist participants can never activate it.
 */
export function isFullTableCategory(
  category: unknown,
): category is FullTableCategory {
  return FULL_TABLE_CATEGORIES.includes(category as FullTableCategory);
}

/**
 * A transaction, or the pool itself for plain reads. Writers must pass their
 * `tx`; read-only callers can hand over `db` rather than opening a transaction
 * just to satisfy the signature.
 */
type DbTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The other half of a declared full table.
 *
 * Pairing is never inferred from map coordinates (PRD §7.1): the companion is
 * whichever other stand shares a `stand_groups` row of type `full_table`. A
 * group that is not exactly two stands has no unambiguous companion, so this
 * returns null rather than guessing.
 */
export async function resolveFullTableCompanion(
  tx: DbTx,
  standId: number,
): Promise<{
  companionStandId: number;
  groupId: number;
  fullTablePrice: number;
} | null> {
  const [self] = await tx
    .select({
      groupId: stands.standGroupId,
      groupType: standGroups.type,
      fullTablePrice: standGroups.fullTablePrice,
    })
    .from(stands)
    .innerJoin(standGroups, eq(standGroups.id, stands.standGroupId))
    .where(eq(stands.id, standId))
    .limit(1);
  if (!self?.groupId || self.groupType !== "full_table") return null;
  // An unpriced table has nothing to bill, so it is not a table anyone can
  // take: the half is reserved on its own, exactly as if it were never paired.
  if (self.fullTablePrice == null) return null;

  const companions = await tx
    .select({ id: stands.id })
    .from(stands)
    .where(and(eq(stands.standGroupId, self.groupId), ne(stands.id, standId)));
  if (companions.length !== 1) return null;

  return {
    companionStandId: companions[0].id,
    groupId: self.groupId,
    fullTablePrice: self.fullTablePrice,
  };
}

/** Stands that nothing currently holds or occupies. */
export async function availableStandIds(
  tx: DbTx,
  standIds: readonly number[],
  now = new Date(),
): Promise<Set<number>> {
  if (standIds.length === 0) return new Set();
  const ids = [...standIds];

  const [held, reserved, statuses] = await Promise.all([
    tx
      .select({ standId: standHoldMembers.standId })
      .from(standHoldMembers)
      .innerJoin(standHolds, eq(standHolds.id, standHoldMembers.holdId))
      .where(
        and(
          inArray(standHoldMembers.standId, ids),
          sql`${standHolds.expiresAt} > ${now}`,
        ),
      ),
    tx
      .select({ standId: standReservationStands.standId })
      .from(standReservationStands)
      .where(
        and(
          inArray(standReservationStands.standId, ids),
          isNull(standReservationStands.releasedAt),
          inArray(standReservationStands.reservationStatus, [
            ...OCCUPYING_RESERVATION_STATUSES,
          ]),
        ),
      ),
    tx
      .select({ id: stands.id, status: stands.status })
      .from(stands)
      .where(inArray(stands.id, ids)),
  ]);

  const taken = new Set([
    ...held.map((row) => row.standId),
    ...reserved.map((row) => row.standId),
  ]);
  return new Set(
    statuses
      .filter((row) => row.status === "available" && !taken.has(row.id))
      .map((row) => row.id),
  );
}

export type FullTableAvailability = {
  /**
   * Full tables an admin has declared for this category, free or not.
   *
   * Zero is a different thing from "all taken", and the two must not be shown
   * the same way: an admin who priced the feature but never paired any stands
   * has no inventory at all, and telling a participant to check back later for
   * one to free up would be untrue.
   */
  declaredPairs: number;
  /** Declared tables with no price set, which are not sellable. */
  unpricedPairs: number;
  /** At least one priced table has both halves free right now. */
  hasFreePair: boolean;
  /** Cheapest priced table with both halves free, for quoting before the map. */
  lowestFreePrice: number | null;
};

/**
 * What full-table inventory this festival has for a category, and how much of
 * it is free.
 *
 * PRD §5: full-table access is not offered when no configured table is
 * complete, because paying for permission to try something with no inventory
 * left is exactly what the feature must not do.
 */
export async function summarizeFullTableAvailability(
  tx: DbTx,
  input: { festivalId: number; category: FullTableCategory },
  now = new Date(),
): Promise<FullTableAvailability> {
  const members = await tx
    .select({
      groupId: stands.standGroupId,
      standId: stands.id,
      fullTablePrice: standGroups.fullTablePrice,
    })
    .from(stands)
    .innerJoin(standGroups, eq(standGroups.id, stands.standGroupId))
    .where(
      and(
        eq(stands.festivalId, input.festivalId),
        eq(stands.standCategory, input.category),
        eq(standGroups.type, "full_table"),
      ),
    );

  const byGroup = new Map<
    number,
    { standIds: number[]; price: number | null }
  >();
  for (const member of members) {
    if (member.groupId == null) continue;
    const group = byGroup.get(member.groupId) ?? {
      standIds: [],
      price: member.fullTablePrice,
    };
    group.standIds.push(member.standId);
    byGroup.set(member.groupId, group);
  }

  // Only a two-member group is a table; a malformed group is not inventory.
  const tables = [...byGroup.values()].filter(
    (group) => group.standIds.length === 2,
  );
  // A table with no price cannot be sold, so it is not inventory either — it
  // is counted separately so an admin can see what is waiting on them.
  const priced = tables.filter((group) => group.price != null);
  const summary = {
    declaredPairs: priced.length,
    unpricedPairs: tables.length - priced.length,
  };
  if (priced.length === 0) {
    return { ...summary, hasFreePair: false, lowestFreePrice: null };
  }

  const free = await availableStandIds(
    tx,
    members.map((member) => member.standId),
    now,
  );
  const freePrices = priced
    .filter((group) => group.standIds.every((standId) => free.has(standId)))
    .map((group) => group.price!);

  return {
    ...summary,
    hasFreePair: freePrices.length > 0,
    lowestFreePrice: freePrices.length > 0 ? Math.min(...freePrices) : null,
  };
}

/** Whether at least one declared table has both halves free right now. */
export async function hasCompleteFullTable(
  tx: DbTx,
  input: { festivalId: number; category: FullTableCategory },
  now = new Date(),
): Promise<boolean> {
  return (await summarizeFullTableAvailability(tx, input, now)).hasFreePair;
}

export type FullTableAccess = {
  featureActionId: number;
  festivalId: number;
  featurePriceSnapshot: number;
};

/**
 * The caller's active full-table access for a festival, if any.
 *
 * Access is per owner and per festival and is never transferable (PRD §7.3).
 */
export async function findActiveFullTableAccess(
  tx: DbTx,
  input: { userId: number; festivalId: number },
): Promise<FullTableAccess | null> {
  const [row] = await tx
    .select({
      featureActionId: reservationFeatureActions.id,
      festivalId: reservationFeatureActions.festivalId,
      featurePriceSnapshot: reservationFeatureActions.featurePriceSnapshot,
    })
    .from(reservationFeatureActions)
    .where(
      and(
        eq(reservationFeatureActions.ownerUserId, input.userId),
        eq(reservationFeatureActions.festivalId, input.festivalId),
        eq(reservationFeatureActions.type, "full_table_access"),
        eq(reservationFeatureActions.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}
