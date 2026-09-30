import "server-only";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { grantCreditsInTx } from "@/app/lib/credits/service";
import { roundMoney } from "@/app/lib/reservations/money";
import { getInvoiceTenderTotalsInTx } from "@/app/lib/reservations/payment-service";
import {
  repriceInvoice,
  type StandChangeSettlement,
} from "@/app/lib/reservations/stand-change";
import { db } from "@/db";
import {
  creditLedgerEntries,
  invoiceCreditAllocations,
  invoiceSettlementSubmissions,
  invoices,
  payments,
  scheduledTasks,
  standHoldMembers,
  standHolds,
  standReservationStands,
  standReservations,
} from "@/db/schema";

/**
 * The money side of changing what a live reservation costs, shared by every
 * admin command that does it: the stand switch and exchange, and the full-table
 * upgrade. One implementation on purpose — a refund one command posts has to
 * be found by the next one, and two copies of the netting would drift.
 */

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ReservationInvoiceRow = {
  id: number;
  userId: number;
  status: string;
  originalAmount: number;
  discountAmount: number;
  amount: number;
};

/** How long a reopened balance gets to be paid — the booking interval. */
export const PAYMENT_WINDOW_DAYS = 5;
export const REMINDER_LEAD_DAYS = 1;

/** Every invoice of a reservation, cancelled ones included. */
export async function readReservationInvoices(
  tx: DbTx,
  reservationId: number,
): Promise<ReservationInvoiceRow[]> {
  return tx
    .select({
      id: invoices.id,
      userId: invoices.userId,
      status: invoices.status,
      originalAmount: invoices.originalAmount,
      discountAmount: invoices.discountAmount,
      amount: invoices.amount,
    })
    .from(invoices)
    .where(eq(invoices.reservationId, reservationId));
}

/**
 * Whether a voucher is in flight against any of these invoices.
 *
 * The one settlement state a price change still cannot pass. A submitted
 * comprobante was uploaded for the old total, and repricing under it would
 * leave the reviewer comparing it against a number that moved after it was
 * sent. Approved payments and confirmed credit allocations are different: they
 * are settled facts, and §4.6 resolves them arithmetically.
 */
export async function invoicesHaveProofUnderReview(
  tx: DbTx,
  invoiceIds: readonly number[],
): Promise<boolean> {
  if (invoiceIds.length === 0) return false;
  const [submission] = await tx
    .select({ id: invoiceSettlementSubmissions.id })
    .from(invoiceSettlementSubmissions)
    .where(
      and(
        inArray(invoiceSettlementSubmissions.invoiceId, [...invoiceIds]),
        eq(invoiceSettlementSubmissions.status, "submitted"),
      ),
    )
    .limit(1);
  return submission != null;
}

/**
 * Whether any money at all sits against these invoices.
 *
 * Cheaper and blunter than the tender totals, and used only in the preview
 * pass: it decides whether the credit-account lock has to be taken, which the
 * canonical order forces before stands and therefore before prices are known.
 */
export async function invoicesHaveTender(
  tx: DbTx,
  invoiceIds: readonly number[],
): Promise<boolean> {
  if (invoiceIds.length === 0) return false;
  const ids = [...invoiceIds];
  const [payment] = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(inArray(payments.invoiceId, ids))
    .limit(1);
  if (payment) return true;
  const [allocation] = await tx
    .select({ id: invoiceCreditAllocations.id })
    .from(invoiceCreditAllocations)
    .where(inArray(invoiceCreditAllocations.invoiceId, ids))
    .limit(1);
  return allocation != null;
}

/** Approved cash plus confirmed credits across a reservation's invoices. */
export async function coveredAmountForInvoices(
  tx: DbTx,
  invoiceRows: readonly Pick<ReservationInvoiceRow, "id" | "amount">[],
): Promise<number> {
  let covered = 0;
  for (const invoice of invoiceRows) {
    const totals = await getInvoiceTenderTotalsInTx(tx, invoice);
    covered += totals.coveredAmount;
  }
  return roundMoney(covered);
}

/**
 * Marks a refund grant as belonging to a reservation, so later moves find it.
 *
 * The command's idempotency key already names the reservation, but a key is an
 * identifier, not a field to query on. This is the field. Every command that
 * refunds a reservation's surplus tags its grant with it — the name predates
 * the full-table upgrade, and renaming it would orphan the grants already
 * posted under it.
 */
export const STAND_CHANGE_REFUND_RESERVATION_KEY =
  "standChangeRefundReservationId";

/**
 * What earlier repricings have already handed back for this reservation.
 *
 * Coverage is computed from payments and credit allocations, and a refund
 * touches neither — it posts a grant into the participant's wallet. So without
 * this, every move re-measures the same coverage an earlier move already paid
 * out against: 500 → 300 refunds 200 and then 300 → 200 refunds another 200,
 * against 500 that was only ever tendered once. Moving back up is the mirror
 * image — 500 → 300 → 500 would read as fully covered on a stand the
 * participant no longer has the money for, because the 200 is in their wallet
 * now.
 *
 * Reversed grants are excluded, the same rule `computeInvoiceTender` applies to
 * allocations: an admin who undoes the refund from the wallet has put the
 * coverage back, and the reservation is covered again.
 *
 * Keyed on the reservation rather than the owner, because it is the
 * reservation's coverage being restated — a reservation whose owner changed
 * still had the money handed back exactly once.
 */
export async function standChangeRefundedAmount(
  tx: DbTx,
  reservationId: number,
): Promise<number> {
  const [row] = await tx
    .select({
      amount: sql<string>`coalesce(sum(${creditLedgerEntries.amount}), 0)`,
    })
    .from(creditLedgerEntries)
    .where(
      and(
        eq(creditLedgerEntries.type, "admin_grant"),
        sql`${creditLedgerEntries.metadata} ->> '${sql.raw(
          STAND_CHANGE_REFUND_RESERVATION_KEY,
        )}' = ${String(reservationId)}`,
        sql`NOT EXISTS (
          SELECT 1
          FROM ${creditLedgerEntries} r
          WHERE r.reverses_entry_id = ${creditLedgerEntries.id}
        )`,
      ),
    );
  return roundMoney(Number(row?.amount ?? 0));
}

/** Whether an unexpired capacity hold covers this stand. */
export async function standHasLiveHold(
  tx: DbTx,
  standId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const [row] = await tx
    .select({ id: standHoldMembers.id })
    .from(standHoldMembers)
    .innerJoin(standHolds, eq(standHolds.id, standHoldMembers.holdId))
    .where(
      and(
        eq(standHoldMembers.standId, standId),
        sql`${standHolds.expiresAt} > ${now}`,
      ),
    )
    .limit(1);
  return row != null;
}

/** The live reservation occupying a stand, if any. */
export async function liveReservationIdForStand(
  tx: DbTx,
  standId: number,
  excludeReservationId: number,
): Promise<number | null> {
  const [row] = await tx
    .select({ reservationId: standReservationStands.reservationId })
    .from(standReservationStands)
    .where(
      and(
        eq(standReservationStands.standId, standId),
        isNull(standReservationStands.releasedAt),
        inArray(standReservationStands.reservationStatus, [
          "pending",
          "verification_payment",
          "accepted",
        ]),
        ne(standReservationStands.reservationId, excludeReservationId),
      ),
    )
    .limit(1);
  return row?.reservationId ?? null;
}

/**
 * Rewrites every live invoice for a new price, in place.
 *
 * Every live invoice is repriced, `paid` ones included: a paid invoice whose
 * reservation got more expensive is exactly the case that has a balance to
 * carry, and skipping it would leave the reservation owing nothing on paper.
 * Cancelled invoices are history and stay as they were.
 */
export async function repriceLiveInvoices(
  tx: DbTx,
  input: {
    invoices: readonly Pick<
      ReservationInvoiceRow,
      "id" | "status" | "discountAmount"
    >[];
    priceAmount: number;
    settlement: StandChangeSettlement;
    now: Date;
  },
) {
  for (const invoice of input.invoices) {
    if (invoice.status === "cancelled") continue;
    const repriced = repriceInvoice(input.priceAmount, invoice.discountAmount);
    await tx
      .update(invoices)
      .set({
        ...repriced,
        // A balance reopens the invoice; anything else keeps the status the
        // repricing found, so a fully covered reservation stays paid.
        ...(input.settlement.kind === "balance_due"
          ? { status: "pending" as const }
          : {}),
        updatedAt: input.now,
      })
      .where(eq(invoices.id, invoice.id));
  }
}

/**
 * Reopens a reservation that now costs more than has been covered.
 *
 * The reservation goes back to `pending`, because `accepted` means paid and
 * this one no longer is; the caller brings its stands back to `reserved`. The
 * deadline is a fresh window measured from the change rather than the original
 * booking: the participant is being asked for money they did not owe when the
 * first clock started, and inheriting a completed task's dates would make the
 * balance overdue the moment it exists.
 */
export async function reopenReservationForBalance(
  tx: DbTx,
  reservation: { reservationId: number; ownerUserId: number | null },
  now: Date,
) {
  await tx
    .update(standReservations)
    .set({ status: "pending", updatedAt: now })
    .where(eq(standReservations.id, reservation.reservationId));

  const dueAt = new Date(
    now.getTime() + PAYMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const reminderAt = new Date(
    dueAt.getTime() - REMINDER_LEAD_DAYS * 24 * 60 * 60 * 1000,
  );

  await tx
    .update(invoices)
    .set({ dueAt, updatedAt: now })
    .where(
      and(
        eq(invoices.reservationId, reservation.reservationId),
        ne(invoices.status, "cancelled"),
      ),
    );

  // An open task means the reservation was still unpaid and already had a
  // clock; it gets the new window rather than a second row, because two open
  // tasks would mean two reminders for one balance. A completed task is
  // history — its `completed_at` told the truth — so that case inserts.
  const [openTask] = await tx
    .select({ id: scheduledTasks.id })
    .from(scheduledTasks)
    .where(
      and(
        eq(scheduledTasks.reservationId, reservation.reservationId),
        eq(scheduledTasks.taskType, "stand_reservation"),
        isNull(scheduledTasks.completedAt),
      ),
    )
    .limit(1);

  if (openTask) {
    await tx
      .update(scheduledTasks)
      .set({
        dueDate: dueAt,
        reminderTime: reminderAt,
        // The reminder for the old deadline may already have gone out, and the
        // reminder job skips any task that has sent one. The new balance gets
        // its own reminder, as an admin deadline extension already does.
        reminderSentAt: null,
        updatedAt: now,
      })
      .where(eq(scheduledTasks.id, openTask.id));
    return;
  }

  if (reservation.ownerUserId != null) {
    await tx.insert(scheduledTasks).values({
      dueDate: dueAt,
      reminderTime: reminderAt,
      profileId: reservation.ownerUserId,
      reservationId: reservation.reservationId,
      taskType: "stand_reservation",
    });
  }
}

/**
 * Hands back what a cheaper price left overpaid, as credits.
 *
 * Credits rather than cash because they are the only refund instrument this
 * product has: there is no payout path, and inventing one from a repricing
 * would be a much larger decision than the repricing itself. The grant is an
 * ordinary `admin_grant` ledger entry, so it shows up in the wallet with its
 * reason and can be reversed from the credit screen like any other.
 *
 * Tagged with the reservation so `standChangeRefundedAmount` can find it. The
 * idempotency key stops one command paying twice; the tag is what stops the
 * *next* command doing it, by taking this refund back out of the coverage that
 * command is measured against. The caller must hold the owner's credit-account
 * lock, as `grantCreditsInTx` requires.
 */
export async function refundOverpaymentAsCredits(
  tx: DbTx,
  input: {
    reservationId: number;
    ownerUserId: number | null;
    refundAmount: number;
    reason: string;
    /**
     * Derived from the command's own key, not a fresh one: the ledger is
     * append-only, and a retry that reached here twice would grant the
     * difference twice.
     */
    idempotencyKey: string;
  },
) {
  if (input.ownerUserId == null) return;
  await grantCreditsInTx(tx, {
    userId: input.ownerUserId,
    amount: input.refundAmount,
    reason: input.reason,
    metadata: {
      [STAND_CHANGE_REFUND_RESERVATION_KEY]: String(input.reservationId),
    },
    idempotencyKey: input.idempotencyKey,
  });
}
