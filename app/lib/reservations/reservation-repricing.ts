import "server-only";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { grantCreditsInTx } from "@/app/lib/credits/service";
import { recordedWriteOffAmount } from "@/app/lib/reservations/invoice-write-offs";
import { loadInvoiceTenders } from "@/app/lib/payments/tender-queries";
import { latePartnerPrepaidAmount } from "@/app/lib/reservations/late-partner-prepaid";
import { roundMoney } from "@/app/lib/reservations/money";
import { applyAcceptedReservation } from "@/app/lib/reservations/payment-service";
import { LATE_PARTNER_REFUND_AMOUNT_KEY } from "@/app/lib/reservations/repricing-refund-ledger";
import { STAND_CHANGE_REFUND_RESERVATION_KEY } from "@/app/lib/reservations/repricing-refunds";
import {
  repriceInvoiceAmounts,
  type RepricingSettlement,
  type ReservationRepricing,
} from "@/app/lib/reservations/repricing";
import { db } from "@/db";
import {
  invoiceCreditAllocations,
  invoiceSettlementSubmissions,
  invoices,
  payments,
  reservationParticipants,
  scheduledTasks,
  standHoldMembers,
  standHolds,
  standReservationStands,
  standReservations,
} from "@/db/schema";

export { latePartnerPrepaidAmount };
// The refund tag lives with the ledger reader the invoice tender and the credit
// release share (`repricing-refund-ledger.ts`); the tender nets refunds, so
// nothing here reads them any more.
export { STAND_CHANGE_REFUND_RESERVATION_KEY };

/**
 * The money side of changing what a live reservation costs, shared by every
 * admin command that does it: the stand switch and exchange, and the full-table
 * upgrade (the downgrade and the partner edit share the arithmetic in
 * `repricing.ts`, but never move money). One implementation on purpose — a
 * refund one command posts has to be found by the next one, and two copies of
 * the netting would drift.
 */

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ReservationInvoiceRow = {
  id: number;
  userId: number;
  status: string;
  originalAmount: number;
  discountAmount: number;
  amount: number;
  /** What "confirmar con saldo pendiente" waived on it, from its events. */
  recordedWriteOffAmount: number;
};

/** How long a reopened balance gets to be paid — the booking interval. */
export const PAYMENT_WINDOW_DAYS = 5;
export const REMINDER_LEAD_DAYS = 1;

/**
 * Every invoice of a reservation, cancelled ones included, oldest first — so
 * "the live cobro" (`liveInvoices[0]`) is the same row the tender nets a
 * refund against, and the same row on every read.
 */
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
      recordedWriteOffAmount: recordedWriteOffAmount(),
    })
    .from(invoices)
    .where(eq(invoices.reservationId, reservationId))
    .orderBy(asc(invoices.id));
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

/**
 * What counts as paid on the cobro when a reservation is repriced: the sum of
 * its live invoices' `coveredAmount` — approved cash plus unreversed credit
 * allocations, less what earlier repricings already handed back.
 *
 * Read from the invoice tender rather than summed here, so a refund is netted
 * exactly once, in one place, and the repricing plan and the cobro's own
 * outstanding balance can never disagree: the plan that reopens a Bs200
 * balance is looking at the same Bs200 the participant is asked to pay.
 * Clamped at zero per cobro, and a late partner's payment is deliberately not
 * in here — it is taken off the price instead (`planReservationRepricing`),
 * so the cobro's own outstanding never shows it as owed.
 */
export async function coveredAmountForInvoices(
  tx: DbTx,
  invoiceRows: readonly Pick<ReservationInvoiceRow, "id" | "amount">[],
): Promise<number> {
  const tenders = await loadInvoiceTenders(tx, invoiceRows);
  let covered = 0;
  for (const tender of tenders.values()) covered += tender.coveredAmount;
  return roundMoney(covered);
}

/**
 * Whether any of these cobros was confirmed through an approved zero-value
 * entitlement — the request a participant sends for a cobro of Bs0.
 *
 * One of the two ways a reservation is confirmed at no cost, which a dearer
 * reprice reopens for the difference (§4.6). The other, a live cobro of Bs0,
 * the pure planner sees for itself; this one it cannot, because a later
 * command that moves no money (the downgrade) can have raised the amount
 * since.
 */
export async function invoicesHaveApprovedZeroValueEntitlement(
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
        eq(invoiceSettlementSubmissions.kind, "zero_value_entitlement"),
        eq(invoiceSettlementSubmissions.status, "approved"),
      ),
    )
    .limit(1);
  return submission != null;
}

/**
 * The money inputs `planReservationRepricing` takes from the database, read
 * the same way by every command that reprices (and by the upgrade's preview),
 * so the dialog and the service measure one thing.
 */
export async function readRepricingMoneyInputs(
  tx: DbTx,
  reservationId: number,
  liveInvoices: readonly Pick<ReservationInvoiceRow, "id" | "amount">[],
): Promise<{
  coveredAmount: number;
  latePartnerPrepaid: number;
  zeroValueEntitlementApproved: boolean;
}> {
  return {
    coveredAmount: await coveredAmountForInvoices(tx, liveInvoices),
    latePartnerPrepaid: await latePartnerPrepaidAmount(tx, reservationId),
    zeroValueEntitlementApproved:
      await invoicesHaveApprovedZeroValueEntitlement(
        tx,
        liveInvoices.map((invoice) => invoice.id),
      ),
  };
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
 * Rewrites every live invoice for a new gross amount, in place.
 *
 * Every live invoice is repriced, `paid` ones included: a paid invoice whose
 * reservation got more expensive is exactly the case that has a balance to
 * carry, and skipping it would leave the reservation owing nothing on paper.
 * Cancelled invoices are history and stay as they were. Each keeps its own
 * discount (clamped) and its own write-off (`repriceInvoiceAmounts`).
 */
export async function repriceLiveInvoices(
  tx: DbTx,
  input: {
    invoices: readonly Pick<
      ReservationInvoiceRow,
      | "id"
      | "status"
      | "originalAmount"
      | "discountAmount"
      | "amount"
      | "recordedWriteOffAmount"
    >[];
    grossAmount: number;
    settlement: RepricingSettlement;
    now: Date;
  },
) {
  for (const invoice of input.invoices) {
    if (invoice.status === "cancelled") continue;
    const repriced = repriceInvoiceAmounts(input.grossAmount, invoice);
    await tx
      .update(invoices)
      .set({
        originalAmount: repriced.originalAmount,
        discountAmount: repriced.discountAmount,
        amount: repriced.amount,
        // A balance reopens the invoice; anything else keeps the status the
        // repricing found, so a fully covered reservation stays paid (and an
        // acceptance marks it paid right after).
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

  // The reminder goes to whoever is asked to pay. That is the owner; a legacy
  // row with none recorded falls back to the live cobro's holder — the payer —
  // and then to the first participant, the same fallback an admin deadline
  // extension uses. Only a reservation with neither has nobody to remind.
  const profileId =
    reservation.ownerUserId ??
    (await taskHolderForOwnerlessReservation(tx, reservation.reservationId));
  if (profileId == null) return;
  await tx.insert(scheduledTasks).values({
    dueDate: dueAt,
    reminderTime: reminderAt,
    profileId,
    reservationId: reservation.reservationId,
    taskType: "stand_reservation",
  });
}

async function taskHolderForOwnerlessReservation(
  tx: DbTx,
  reservationId: number,
): Promise<number | null> {
  const [invoice] = await tx
    .select({ userId: invoices.userId })
    .from(invoices)
    .where(
      and(
        eq(invoices.reservationId, reservationId),
        ne(invoices.status, "cancelled"),
      ),
    )
    .orderBy(asc(invoices.id))
    .limit(1);
  if (invoice) return invoice.userId;
  const [participant] = await tx
    .select({ userId: reservationParticipants.userId })
    .from(reservationParticipants)
    .where(eq(reservationParticipants.reservationId, reservationId))
    .orderBy(asc(reservationParticipants.id))
    .limit(1);
  return participant?.userId ?? null;
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
 * Tagged with the reservation so the invoice tender can find it. The
 * idempotency key stops one command paying twice; the tag is what stops the
 * *next* command doing it, by taking this refund back out of the coverage that
 * command is measured against — and what keeps the cobro's own outstanding
 * balance honest if the reservation later moves back up. The caller must hold the owner's credit-account
 * lock, as `grantCreditsInTx` requires.
 */
export async function refundOverpaymentAsCredits(
  tx: DbTx,
  input: {
    reservationId: number;
    ownerUserId: number | null;
    refundAmount: number;
    /**
     * The part of `refundAmount` that returns a late partner's payment rather
     * than money on the cobro (`ReservationRepricing.latePartnerRefundAmount`),
     * recorded on the grant so the tender leaves it alone and the late-partner
     * figure drops by it instead.
     */
    latePartnerRefundAmount?: number;
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
  const latePartnerPart = roundMoney(input.latePartnerRefundAmount ?? 0);
  await grantCreditsInTx(tx, {
    userId: input.ownerUserId,
    amount: input.refundAmount,
    reason: input.reason,
    metadata: {
      [STAND_CHANGE_REFUND_RESERVATION_KEY]: String(input.reservationId),
      ...(latePartnerPart > 0
        ? { [LATE_PARTNER_REFUND_AMOUNT_KEY]: String(latePartnerPart) }
        : {}),
    },
    idempotencyKey: input.idempotencyKey,
  });
}

/**
 * Applies a planned reprice's money: the cobro rewritten, then the settlement.
 *
 * Shared by the stand switch and the full-table upgrade, which must both call
 * it after their membership writes: an acceptance confirms every live member
 * stand, and it has to see the stands the reservation ends up on. The caller
 * still owns the stand statuses it writes afterwards, which follow
 * `plan.resultingStatus`, and it must hold the owner's credit-account lock
 * whenever the plan is `overpaid`.
 *
 * The acceptance is the same write set as every other one
 * (`applyAcceptedReservation`): reservation accepted, cobro paid, the
 * `stand_reservation` task completed, member stands confirmed, and a
 * `settlement_approved` event. No notification is sent — the admin commands
 * that reprice notify nobody, and the participant is told out of band.
 */
export async function applyReservationRepricing(
  tx: DbTx,
  input: {
    reservationId: number;
    ownerUserId: number | null;
    /** Fallback stand for the acceptance when no member row is live. */
    standId: number;
    invoices: readonly ReservationInvoiceRow[];
    plan: ReservationRepricing;
    actorUserId: number;
    refund: { reason: string; idempotencyKey: string };
    now: Date;
  },
) {
  const { plan } = input;
  if (!plan.priceChanged) return;

  await repriceLiveInvoices(tx, {
    invoices: input.invoices,
    grossAmount: plan.grossAmount,
    settlement: plan.settlement,
    now: input.now,
  });

  if (plan.settlement.kind === "balance_due") {
    await reopenReservationForBalance(
      tx,
      { reservationId: input.reservationId, ownerUserId: input.ownerUserId },
      input.now,
    );
    return;
  }

  if (plan.settlement.kind === "overpaid") {
    if (input.ownerUserId == null) {
      // Every caller refuses this before writing; reaching it would drop the
      // refund on the floor.
      throw new Error("repricing_refund_without_owner");
    }
    await refundOverpaymentAsCredits(tx, {
      reservationId: input.reservationId,
      ownerUserId: input.ownerUserId,
      refundAmount: plan.settlement.refundAmount,
      latePartnerRefundAmount: plan.latePartnerRefundAmount,
      reason: input.refund.reason,
      idempotencyKey: input.refund.idempotencyKey,
    });
  }

  if (plan.completesAcceptance) {
    const liveInvoice = input.invoices.find(
      (invoice) => invoice.status !== "cancelled",
    );
    if (!liveInvoice) throw new Error("repricing_acceptance_without_invoice");
    await applyAcceptedReservation(
      tx,
      input.reservationId,
      input.standId,
      liveInvoice.id,
      input.actorUserId,
    );
  }
}
