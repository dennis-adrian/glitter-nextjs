import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import {
  type FeatureCreditItem,
  type FeatureCreditsMap,
} from "@/app/lib/payments/feature-credits";
import { roundMoney } from "@/app/lib/reservations/money";
import { db } from "@/db";
import {
  creditLedgerEntries,
  reservationFeatureActionItems,
  reservationFeatureActions,
} from "@/db/schema";

/**
 * Feature-action credits for a batch of reservations, in two queries.
 *
 * Keyed by reservation so a festival's whole console costs the same two rounds
 * the tender projection does, rather than a join per row.
 */
export async function fetchReservationFeatureCredits(
  reservationIds: readonly number[],
): Promise<FeatureCreditsMap> {
  const byReservation: FeatureCreditsMap = new Map();
  if (reservationIds.length === 0) return byReservation;

  const ids = [...new Set(reservationIds)];

  const actionRows = await db
    .select({
      id: reservationFeatureActions.id,
      reservationId: reservationFeatureActions.reservationId,
      type: reservationFeatureActions.type,
      status: reservationFeatureActions.status,
      createdAt: reservationFeatureActions.createdAt,
      ledgerEntryId: creditLedgerEntries.id,
      amount: creditLedgerEntries.amount,
      // Same predicate the tender uses for allocations, so a refunded feature
      // and a released allocation are read the same way.
      reversed: sql<boolean>`EXISTS (
        SELECT 1
        FROM ${creditLedgerEntries} r
        WHERE r.reverses_entry_id = ${creditLedgerEntries.id}
      )`,
    })
    .from(reservationFeatureActions)
    // One `spend` per feature action is enforced by a unique index, so this
    // stays one row per action.
    .leftJoin(
      creditLedgerEntries,
      and(
        eq(creditLedgerEntries.featureActionId, reservationFeatureActions.id),
        eq(creditLedgerEntries.type, "spend"),
      ),
    )
    .where(inArray(reservationFeatureActions.reservationId, ids))
    .orderBy(
      asc(reservationFeatureActions.createdAt),
      asc(reservationFeatureActions.id),
    );

  const actionIds = actionRows.map((row) => row.id);
  const itemRows =
    actionIds.length === 0
      ? []
      : await db
          .select({
            featureActionId: reservationFeatureActionItems.featureActionId,
            kind: reservationFeatureActionItems.kind,
            amount: reservationFeatureActionItems.amount,
            description: reservationFeatureActionItems.descriptionSnapshot,
          })
          .from(reservationFeatureActionItems)
          .where(
            inArray(reservationFeatureActionItems.featureActionId, actionIds),
          )
          .orderBy(asc(reservationFeatureActionItems.id));

  const itemsByAction = new Map<number, FeatureCreditItem[]>();
  for (const row of itemRows) {
    const bucket = itemsByAction.get(row.featureActionId) ?? [];
    bucket.push({
      kind: row.kind,
      amount: roundMoney(Number(row.amount)),
      description: row.description,
    });
    itemsByAction.set(row.featureActionId, bucket);
  }

  for (const row of actionRows) {
    // `reservation_id` is nullable — the FK is `on delete set null`, so a
    // deleted reservation leaves its action behind. Those cannot be attributed
    // and the `inArray` above already excludes them; this only narrows the type.
    if (row.reservationId == null) continue;
    const bucket = byReservation.get(row.reservationId) ?? [];
    bucket.push({
      actionId: row.id,
      type: row.type,
      status: row.status,
      // Spends are posted negative; the console asks what was charged.
      amount: row.amount == null ? 0 : Math.abs(roundMoney(Number(row.amount))),
      reversed: Boolean(row.reversed),
      createdAt: row.createdAt,
      items: itemsByAction.get(row.id) ?? [],
    });
    byReservation.set(row.reservationId, bucket);
  }

  return byReservation;
}
