import "server-only";

import { eq, inArray, sql } from "drizzle-orm";

import {
  invoiceMoneyBlocker,
  strongestMoneyBlocker,
  type FullTableDowngradeMoneyBlocker,
} from "@/app/lib/reservations/full-table-downgrade";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  creditLedgerEntries,
  invoiceCreditAllocations,
  invoiceSettlementSubmissions,
  invoices,
  payments,
  standReservations,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The real money on a set of cobros, judged by `invoiceMoneyBlocker`.
 *
 * Every invoice of the reservation, cancelled ones included, as the upgrade's
 * lock decision reads them: a cancellation hands credits back and never
 * cancels a cobro with payments, so a cancelled one only blocks if something
 * is still genuinely on it.
 */
export async function invoicesMoneyBlockerInTx(
  tx: DbTx,
  invoiceIds: readonly number[],
): Promise<FullTableDowngradeMoneyBlocker | null> {
  if (invoiceIds.length === 0) return null;
  const ids = [...invoiceIds];
  const [paymentRows, allocationRows, submissionRows] = await Promise.all([
    tx
      .select({
        id: payments.id,
        invoiceId: payments.invoiceId,
        amount: payments.amount,
      })
      .from(payments)
      .where(inArray(payments.invoiceId, ids)),
    tx
      .select({
        invoiceId: invoiceCreditAllocations.invoiceId,
        amount: invoiceCreditAllocations.amount,
        // The same test the tender applies: a ledger entry pointing at the
        // allocation's spend undoes it, and the row stays as history.
        reversed: sql<boolean>`EXISTS (
          SELECT 1
          FROM ${creditLedgerEntries} r
          WHERE r.reverses_entry_id = ${invoiceCreditAllocations.ledgerEntryId}
        )`,
      })
      .from(invoiceCreditAllocations)
      .where(inArray(invoiceCreditAllocations.invoiceId, ids)),
    tx
      .select({
        invoiceId: invoiceSettlementSubmissions.invoiceId,
        paymentId: invoiceSettlementSubmissions.paymentId,
        status: invoiceSettlementSubmissions.status,
        kind: invoiceSettlementSubmissions.kind,
      })
      .from(invoiceSettlementSubmissions)
      .where(inArray(invoiceSettlementSubmissions.invoiceId, ids)),
  ]);

  return strongestMoneyBlocker(
    ids.map((invoiceId) =>
      invoiceMoneyBlocker({
        payments: paymentRows.filter((row) => row.invoiceId === invoiceId),
        allocations: allocationRows
          .filter((row) => row.invoiceId === invoiceId)
          .map((row) => ({
            amount: row.amount,
            reversed: Boolean(row.reversed),
          })),
        submissions: submissionRows.filter(
          (row) => row.invoiceId === invoiceId,
        ),
      }),
    ),
  );
}

/**
 * Why `downgradeFullTableReservation` would refuse this reservation for money,
 * or null when it would not.
 *
 * The one predicate the service runs under its locks and the edit page runs to
 * disable the button, so the two cannot disagree. A full table from before
 * table pricing (no `full_table_price_snapshot`) is never refused for money:
 * its cobro already was one half's price, and the downgrade leaves it alone.
 */
export async function fullTableDowngradeMoneyBlockerInTx(
  tx: DbTx,
  reservation: { id: number; fullTablePriceSnapshot: number | null },
): Promise<FullTableDowngradeMoneyBlocker | null> {
  if (reservation.fullTablePriceSnapshot == null) return null;
  const invoiceRows = await tx
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.reservationId, reservation.id));
  return invoicesMoneyBlockerInTx(
    tx,
    invoiceRows.map((row) => row.id),
  );
}

/**
 * What the edit page needs to disable "Reducir a media mesa" with its reason
 * instead of letting an admin confirm into a refusal.
 *
 * Returns null to anyone without admin read access and for a reservation that
 * does not exist. Read-only: it runs in a read-only transaction, which
 * Postgres enforces.
 */
export async function fetchFullTableDowngradeBlocker(
  reservationId: number,
): Promise<{ moneyBlocker: FullTableDowngradeMoneyBlocker | null } | null> {
  const actor = await getCurrentUserProfile();
  if (!canViewAdminReservationData(actor)) return null;

  return db.transaction(
    async (tx) => {
      const [reservation] = await tx
        .select({
          id: standReservations.id,
          fullTablePriceSnapshot: standReservations.fullTablePriceSnapshot,
        })
        .from(standReservations)
        .where(eq(standReservations.id, reservationId))
        .limit(1);
      if (!reservation) return null;
      return {
        moneyBlocker: await fullTableDowngradeMoneyBlockerInTx(tx, reservation),
      };
    },
    { accessMode: "read only" },
  );
}
