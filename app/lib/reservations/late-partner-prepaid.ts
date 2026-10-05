import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { roundMoney } from "@/app/lib/reservations/money";
import { latePartnerRefundedAmount } from "@/app/lib/reservations/repricing-refund-ledger";
import { db } from "@/db";
import {
  creditLedgerEntries,
  reservationFeatureActionItems,
  reservationFeatureActions,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * What a late partner already paid towards the stand itself, in credits.
 *
 * `addLatePartner` debits two things in one spend: the shared-price difference
 * (what two people cost over one) and the festival's fee. The cobro stays at
 * the individual price and the difference sits on the feature action, so any
 * command that reprices the reservation has to count it as paid — otherwise
 * the participant is billed the difference a second time. The fee is not part
 * of it: it paid for adding someone late, and stays spent.
 *
 * Counted only for `fulfilled` actions of this reservation whose spend has not
 * been reversed. Nothing reverses a late-partner spend today (the credit screen
 * refuses spends), but a reversed spend would mean the money went back, and
 * counting it anyway would be a free stand.
 *
 * Net of what a repricing already handed back of it: a stand cheaper than the
 * late partner's payment alone refunds the excess (`latePartnerRefundedAmount`),
 * and that money is no longer paid towards the stand. Taken off here, not off
 * the cobro's tender, because it never sat on the cobro — so moving back up
 * asks for it again, on the cobro, and a payment for it settles the cobro
 * exactly.
 *
 * Its own module, free of the payment service, so the admin partner edit can
 * use it without importing the module that imports it. Read-only: callers read
 * it under their reservation lock, which `addLatePartner` takes too, so the
 * figure cannot move under them.
 */
export async function latePartnerPrepaidAmount(
  tx: DbTx,
  reservationId: number,
): Promise<number> {
  const [row] = await tx
    .select({
      amount: sql<string>`coalesce(sum(${reservationFeatureActionItems.amount}), 0)`,
    })
    .from(reservationFeatureActionItems)
    .where(
      and(
        eq(reservationFeatureActionItems.kind, "shared_price_difference"),
        sql`EXISTS (
          SELECT 1
          FROM ${reservationFeatureActions} a
          WHERE a.id = ${reservationFeatureActionItems.featureActionId}
            AND a.reservation_id = ${reservationId}
            AND a.type = 'late_partner'
            AND a.status = 'fulfilled'
            AND NOT EXISTS (
              SELECT 1
              FROM ${creditLedgerEntries} s
              JOIN ${creditLedgerEntries} r ON r.reverses_entry_id = s.id
              WHERE s.feature_action_id = a.id
                AND s.type = 'spend'
            )
        )`,
      ),
    );
  const returned = await latePartnerRefundedAmount(tx, reservationId);
  return Math.max(0, roundMoney(Number(row?.amount ?? 0) - returned));
}
