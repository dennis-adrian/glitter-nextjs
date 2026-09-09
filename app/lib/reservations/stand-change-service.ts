import "server-only";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import {
  reservationFailure,
  reservationSuccess,
  type ReservationActionResult,
} from "@/app/lib/reservations/errors";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import {
  lockParticipantsBeforeRegistryClaim,
  lockReservationAggregate,
  readReservationParticipantIds,
  uniqueSortedIds,
} from "@/app/lib/reservations/locks";
import { activeReservationStandIds } from "@/app/lib/reservations/members";
import { releaseStandIfVacant } from "@/app/lib/reservations/occupancy";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import {
  abandonRequest,
  claimRequest,
  completeRequest,
} from "@/app/lib/reservations/request-registry";
import {
  isMovableReservationStatus,
  repriceInvoice,
  resolveStandChangePricing,
  resolveStandChangeSettlement,
  type MovableReservationStatus,
  type StandChangeSettlement,
} from "@/app/lib/reservations/stand-change";
import { grantCreditsInTx } from "@/app/lib/credits/service";
import { roundMoney } from "@/app/lib/reservations/money";
import { getInvoiceTenderTotalsInTx } from "@/app/lib/reservations/payment-service";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
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
  stands,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type StandChangeResult = ReservationActionResult<{
  mode: "switch" | "exchange";
  reservationId: number;
  fromStandId: number;
  toStandId: number;
  /** Set only for an exchange: the reservation that took the origin stand. */
  counterpartReservationId: number | null;
}>;

type MovableReservation = {
  id: number;
  festivalId: number;
  status: MovableReservationStatus;
  standId: number;
  ownerUserId: number | null;
  bookedParticipantCount: number;
  priceAmountSnapshot: number | null;
};

const RESERVATION_COLUMNS = {
  id: standReservations.id,
  festivalId: standReservations.festivalId,
  status: standReservations.status,
  standId: standReservations.standId,
  ownerUserId: standReservations.ownerUserId,
  bookedParticipantCount: standReservations.bookedParticipantCount,
  priceAmountSnapshot: standReservations.priceAmountSnapshot,
};

/**
 * The reservation, plus the single stand it occupies.
 *
 * Returns null when the reservation is not movable at all: a closed one holds
 * no stand to move, and a full table holds two, which makes "change the stand"
 * a question with no single answer. Full tables are reduced to half a table
 * first, through the downgrade that already exists for them.
 */
async function readMovableReservation(
  tx: DbTx,
  reservationId: number,
): Promise<{ reservation: MovableReservation; standId: number } | null> {
  const [reservation] = await tx
    .select(RESERVATION_COLUMNS)
    .from(standReservations)
    .where(eq(standReservations.id, reservationId))
    .limit(1);
  if (!reservation) return null;
  if (!isMovableReservationStatus(reservation.status)) return null;

  const memberStandIds = await activeReservationStandIds(tx, reservation.id);
  if (memberStandIds.length !== 1) return null;

  return {
    reservation: { ...reservation, status: reservation.status },
    standId: memberStandIds[0],
  };
}

/**
 * A member row this reservation once held on the destination stand.
 *
 * `stand_reservation_stands_reservation_stand_unique` counts released history,
 * so a reservation downgraded off a stand can never be moved back onto it by
 * rewriting its live member row. Refusing is honest; deleting the released row
 * would erase the downgrade the table keeps on purpose.
 */
async function hasRetiredMemberOnStand(
  tx: DbTx,
  reservationId: number,
  standId: number,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: standReservationStands.id })
    .from(standReservationStands)
    .where(
      and(
        eq(standReservationStands.reservationId, reservationId),
        eq(standReservationStands.standId, standId),
      ),
    )
    .limit(1);
  return row != null;
}

async function standHasLiveHold(
  tx: DbTx,
  standId: number,
  now: Date,
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
async function liveReservationIdForStand(
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

type InvoiceRow = {
  id: number;
  status: string;
  discountAmount: number;
  amount: number;
};

/** How long a reopened balance gets to be paid — the booking interval. */
const PAYMENT_WINDOW_DAYS = 5;
const REMINDER_LEAD_DAYS = 1;

async function readReservationInvoices(
  tx: DbTx,
  reservationId: number,
): Promise<InvoiceRow[]> {
  return tx
    .select({
      id: invoices.id,
      status: invoices.status,
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
async function invoicesHaveProofUnderReview(
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
async function invoicesHaveTender(
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
async function coveredAmountForInvoices(
  tx: DbTx,
  invoiceRows: readonly InvoiceRow[],
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
 * identifier, not a field to query on. This is the field.
 */
const STAND_CHANGE_REFUND_RESERVATION_KEY = "standChangeRefundReservationId";

/**
 * What earlier stand changes have already handed back for this reservation.
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
async function standChangeRefundedAmount(
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

type SidePlan = {
  reservation: MovableReservation;
  fromStandId: number;
  toStandId: number;
  /** The status the destination stand inherits from the origin. */
  carriedStandStatus:
    | "available"
    | "held"
    | "reserved"
    | "confirmed"
    | "disabled";
  pricing: ReturnType<typeof resolveStandChangePricing>;
  invoices: InvoiceRow[];
  /**
   * Approved cash plus confirmed credits before the move, less whatever
   * earlier stand changes already refunded out of it.
   */
  coveredAmount: number;
  settlement: StandChangeSettlement;
  /** The command's idempotency key, so the credit grant inherits it. */
  requestKey: string;
};

/**
 * Applies one side of a move: parent pointer, price snapshots, and invoices.
 *
 * Membership is deliberately not written here. A switch rewrites its member row
 * on its own, while an exchange has to interleave both sides' member writes
 * around a parking step, and burying that ordering inside a per-side helper
 * would hide the one part of this feature that has to happen in a fixed order.
 */
async function applySidePointerAndMoney(tx: DbTx, plan: SidePlan, now: Date) {
  await tx
    .update(standReservations)
    .set({
      standId: plan.toStandId,
      priceAmountSnapshot: plan.pricing.priceAmount,
      individualPriceSnapshot: plan.pricing.individualPrice,
      sharedPriceSnapshot: plan.pricing.sharedPrice,
      updatedAt: now,
    })
    .where(eq(standReservations.id, plan.reservation.id));

  if (!plan.pricing.priceChanged) return;

  // Every live invoice is repriced, `paid` ones included: a paid invoice whose
  // stand got more expensive is exactly the case that has a balance to carry,
  // and skipping it would leave the reservation owing nothing on paper.
  for (const invoice of plan.invoices) {
    if (invoice.status === "cancelled") continue;
    const repriced = repriceInvoice(
      plan.pricing.priceAmount,
      invoice.discountAmount,
    );
    await tx
      .update(invoices)
      .set({
        ...repriced,
        // A balance reopens the invoice; anything else keeps the status the
        // move found, so a fully covered reservation stays paid.
        ...(plan.settlement.kind === "balance_due"
          ? { status: "pending" as const }
          : {}),
        updatedAt: now,
      })
      .where(eq(invoices.id, invoice.id));
  }

  if (plan.settlement.kind === "balance_due") {
    await reopenReservationForBalance(tx, plan, now);
    return;
  }
  if (plan.settlement.kind === "overpaid") {
    await refundOverpaymentAsCredits(tx, plan);
  }
}

/**
 * The status the destination stand actually lands on.
 *
 * Normally the origin's, so a paid reservation carries `confirmed` across. A
 * balance owed is the exception: the reservation goes back to `pending`, and a
 * stand left `confirmed` under it would read as paid on every map and report
 * that trusts `stands.status`.
 */
function effectiveStandStatus(plan: SidePlan): SidePlan["carriedStandStatus"] {
  if (
    plan.settlement.kind === "balance_due" &&
    plan.carriedStandStatus === "confirmed"
  ) {
    return "reserved";
  }
  return plan.carriedStandStatus;
}

/**
 * Reopens a reservation whose new stand costs more than has been covered.
 *
 * The reservation goes back to `pending` and its stand to `reserved`, because
 * `accepted` means paid and this one no longer is. The deadline is a fresh
 * window measured from the move rather than the original booking: the
 * participant is being asked for money they did not owe when the first clock
 * started, and inheriting a completed task's dates would make the balance
 * overdue the moment it exists.
 */
async function reopenReservationForBalance(
  tx: DbTx,
  plan: SidePlan,
  now: Date,
) {
  await tx
    .update(standReservations)
    .set({ status: "pending", updatedAt: now })
    .where(eq(standReservations.id, plan.reservation.id));

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
        eq(invoices.reservationId, plan.reservation.id),
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
        eq(scheduledTasks.reservationId, plan.reservation.id),
        eq(scheduledTasks.taskType, "stand_reservation"),
        isNull(scheduledTasks.completedAt),
      ),
    )
    .limit(1);

  if (openTask) {
    await tx
      .update(scheduledTasks)
      .set({ dueDate: dueAt, reminderTime: reminderAt, updatedAt: now })
      .where(eq(scheduledTasks.id, openTask.id));
    return;
  }

  const ownerUserId = plan.reservation.ownerUserId;
  if (ownerUserId != null) {
    await tx.insert(scheduledTasks).values({
      dueDate: dueAt,
      reminderTime: reminderAt,
      profileId: ownerUserId,
      reservationId: plan.reservation.id,
      taskType: "stand_reservation",
    });
  }
}

/**
 * Hands back what a cheaper stand left overpaid, as credits.
 *
 * Credits rather than cash because they are the only refund instrument this
 * product has: there is no payout path, and inventing one from a stand change
 * would be a much larger decision than the move itself. The grant is an
 * ordinary `admin_grant` ledger entry, so it shows up in the wallet with its
 * reason and can be reversed from the credit screen like any other.
 *
 * Tagged with the reservation so `standChangeRefundedAmount` can find it. The
 * idempotency key stops one command paying twice; the tag is what stops the
 * *next* command doing it, by taking this refund back out of the coverage that
 * move is measured against.
 */
async function refundOverpaymentAsCredits(tx: DbTx, plan: SidePlan) {
  if (plan.settlement.kind !== "overpaid") return;
  const ownerUserId = plan.reservation.ownerUserId;
  if (ownerUserId == null) return;

  await grantCreditsInTx(tx, {
    userId: ownerUserId,
    amount: plan.settlement.refundAmount,
    reason: `Cambio de espacio: diferencia a favor de la reserva #${plan.reservation.id}`,
    metadata: {
      [STAND_CHANGE_REFUND_RESERVATION_KEY]: String(plan.reservation.id),
    },
    // The command's own key, not a fresh one: the ledger is append-only, and a
    // retry that reached here twice would grant the difference twice.
    idempotencyKey: `stand-change-refund:${plan.requestKey}:${plan.reservation.id}`,
  });
}

async function buildSidePlan(
  tx: DbTx,
  reservation: MovableReservation,
  fromStandId: number,
  destination: {
    id: number;
    individualPrice: number;
    sharedPrice: number | null;
  },
  carriedStandStatus: SidePlan["carriedStandStatus"],
  requestKey: string,
): Promise<SidePlan> {
  const pricing = resolveStandChangePricing(reservation, destination);
  const invoiceRows = await readReservationInvoices(tx, reservation.id);
  const liveInvoices = invoiceRows.filter(
    (invoice) => invoice.status !== "cancelled",
  );
  // Net of what earlier moves handed back. Clamped at zero so `coveredAmount`
  // keeps meaning what its name says: a voucher rejected after a refund can
  // leave the two out of step, and that is a debt for the wallet to carry, not
  // a negative coverage for the settlement to reason about.
  const coveredAmount = Math.max(
    0,
    roundMoney(
      (await coveredAmountForInvoices(tx, liveInvoices)) -
        (await standChangeRefundedAmount(tx, reservation.id)),
    ),
  );
  // Priced against the discount the invoice already carries, so the settlement
  // is measured against what will actually be owed rather than the gross price.
  const newInvoiceAmount =
    liveInvoices.length === 0
      ? pricing.priceAmount
      : repriceInvoice(pricing.priceAmount, liveInvoices[0].discountAmount)
          .amount;

  return {
    reservation,
    fromStandId,
    toStandId: destination.id,
    carriedStandStatus,
    pricing,
    invoices: invoiceRows,
    coveredAmount,
    settlement: pricing.priceChanged
      ? resolveStandChangeSettlement({ newInvoiceAmount, coveredAmount })
      : { kind: "none" },
    requestKey,
  };
}

/**
 * Moves a reservation to another stand, exchanging with whoever holds it.
 *
 * A stand change is a manual correction, never a participant-facing path:
 * self-service gives a stand up through the paid release (§9), and the fee is
 * what stops the map churning. This is the admin's way to fix a placement
 * without deleting a reservation and rebuilding it, which would throw away the
 * invoice, the payment state, and the audit trail.
 *
 * `allowExchange` is the admin's explicit decision, taken in the dialog: an
 * occupied destination moves two participants rather than one, and nobody
 * should discover that after the fact.
 */
export async function changeReservationStand(input: {
  reservationId: number;
  destinationStandId: number;
  idempotencyKey: string;
  allowExchange?: boolean;
}): Promise<StandChangeResult> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return reservationFailure("UNAUTHORIZED");
  }
  const actorId = actor.id;

  return db.transaction(async (tx) => {
    const now = new Date();

    // Assembled before the registry claim because the advisory locks have to
    // be held first, but deliberately judgement-free: every refusal waits
    // until the claim, so retrying a completed move replays its result instead
    // of tripping a guard the first call already passed. `SAME_STAND` is the
    // one that made this ordering necessary — after a successful move the
    // reservation really is on the destination.
    const [reservationRow] = await tx
      .select({
        id: standReservations.id,
        festivalId: standReservations.festivalId,
        ownerUserId: standReservations.ownerUserId,
      })
      .from(standReservations)
      .where(eq(standReservations.id, input.reservationId))
      .limit(1);
    if (!reservationRow) return reservationFailure("STAND_CHANGE_NOT_MOVABLE");

    const counterpartPreviewId = await liveReservationIdForStand(
      tx,
      input.destinationStandId,
      reservationRow.id,
    );
    const counterpartOwnerUserId =
      counterpartPreviewId == null
        ? null
        : ((
            await tx
              .select({ ownerUserId: standReservations.ownerUserId })
              .from(standReservations)
              .where(eq(standReservations.id, counterpartPreviewId))
              .limit(1)
          )[0]?.ownerUserId ?? null);

    const previewUserIds = uniqueSortedIds([
      ...(await readReservationParticipantIds(tx, reservationRow.id)),
      ...(reservationRow.ownerUserId != null
        ? [reservationRow.ownerUserId]
        : []),
      ...(counterpartPreviewId != null
        ? await readReservationParticipantIds(tx, counterpartPreviewId)
        : []),
      ...(counterpartOwnerUserId != null ? [counterpartOwnerUserId] : []),
    ]);

    await lockParticipantsBeforeRegistryClaim(
      tx,
      reservationRow.festivalId,
      previewUserIds,
    );

    const claim = await claimRequest(tx, {
      requestKey: input.idempotencyKey,
      operation: "changeReservationStand",
      actorUserId: actorId,
      scope: {
        reservationId: input.reservationId,
        destinationStandId: input.destinationStandId,
      },
    });
    if (claim.kind === "conflict") return reservationFailure("CONFLICT_RETRY");
    if (claim.kind === "replayed") {
      const fromStandId = claim.resultIds.fromStandId;
      const toStandId = claim.resultIds.toStandId;
      if (typeof fromStandId !== "number" || typeof toStandId !== "number") {
        return reservationFailure("CONFLICT_RETRY");
      }
      const counterpartReservationId =
        typeof claim.resultIds.counterpartReservationId === "number"
          ? claim.resultIds.counterpartReservationId
          : null;
      return reservationSuccess(
        {
          mode: counterpartReservationId == null ? "switch" : "exchange",
          reservationId: input.reservationId,
          fromStandId,
          toStandId,
          counterpartReservationId,
        },
        counterpartReservationId == null
          ? "La reserva ya fue movida a ese espacio."
          : "El intercambio de espacios ya fue realizado.",
      );
    }

    const fail = async (
      failure: Extract<ReservationActionResult, { success: false }>,
    ) => {
      await abandonRequest(tx, input.idempotencyKey);
      return failure;
    };

    const preview = await readMovableReservation(tx, input.reservationId);
    if (!preview) return fail(reservationFailure("STAND_CHANGE_NOT_MOVABLE"));
    if (preview.standId === input.destinationStandId) {
      return fail(reservationFailure("STAND_CHANGE_SAME_STAND"));
    }

    const [destinationPreview] = await tx
      .select({ id: stands.id, festivalId: stands.festivalId })
      .from(stands)
      .where(eq(stands.id, input.destinationStandId))
      .limit(1);
    if (!destinationPreview) return fail(reservationFailure("STAND_NOT_FOUND"));
    if (destinationPreview.festivalId !== preview.reservation.festivalId) {
      return fail(reservationFailure("STAND_WRONG_FESTIVAL"));
    }

    const counterpartPreview =
      counterpartPreviewId == null
        ? null
        : await readMovableReservation(tx, counterpartPreviewId);
    if (counterpartPreviewId != null && !counterpartPreview) {
      // Occupied by something this command cannot move — a full table, in
      // practice. Refusing beats silently leaving it where it is.
      return fail(reservationFailure("STAND_CHANGE_NOT_MOVABLE"));
    }
    if (counterpartPreview && !input.allowExchange) {
      return fail(reservationFailure("STAND_CHANGE_EXCHANGE_NOT_CONFIRMED"));
    }

    const reservationIds = uniqueSortedIds([
      preview.reservation.id,
      ...(counterpartPreview ? [counterpartPreview.reservation.id] : []),
    ]);

    const previewStandIds = uniqueSortedIds([
      preview.standId,
      input.destinationStandId,
    ]);
    const previewInvoiceIds = uniqueSortedIds([
      ...(await readReservationInvoices(tx, preview.reservation.id)).map(
        (row) => row.id,
      ),
      ...(counterpartPreview
        ? (
            await readReservationInvoices(tx, counterpartPreview.reservation.id)
          ).map((row) => row.id)
        : []),
    ]);

    // A move that could hand credits back needs the owners' credit accounts
    // locked, and the canonical order places them before stands — so the
    // decision has to be made here, before prices are known. Any money already
    // against an invoice is enough to take the lock; most moves have none and
    // skip it.
    const lockedCreditUserIds = (await invoicesHaveTender(
      tx,
      previewInvoiceIds,
    ))
      ? uniqueSortedIds([
          ...(preview.reservation.ownerUserId != null
            ? [preview.reservation.ownerUserId]
            : []),
          ...(counterpartPreview?.reservation.ownerUserId != null
            ? [counterpartPreview.reservation.ownerUserId]
            : []),
        ])
      : [];

    const locked = await lockReservationAggregate(tx, {
      festivalId: preview.reservation.festivalId,
      userIds: previewUserIds,
      creditAccountUserIds: lockedCreditUserIds,
      standIds: previewStandIds,
      reservationIds,
      invoiceIds: previewInvoiceIds,
    });
    if (!locked.ok) return fail(reservationFailure("CONFLICT_RETRY"));

    // Re-read everything the decision rests on, now that the rows are pinned.
    const source = await readMovableReservation(tx, input.reservationId);
    if (!source) return fail(reservationFailure("STAND_CHANGE_NOT_MOVABLE"));
    if (source.standId !== preview.standId) {
      return fail(reservationFailure("CONFLICT_RETRY"));
    }

    const [destination] = await tx
      .select({
        id: stands.id,
        festivalId: stands.festivalId,
        status: stands.status,
        individualPrice: stands.individualPrice,
        sharedPrice: stands.sharedPrice,
      })
      .from(stands)
      .where(eq(stands.id, input.destinationStandId))
      .limit(1);
    if (!destination) return fail(reservationFailure("STAND_NOT_FOUND"));
    if (destination.festivalId !== source.reservation.festivalId) {
      return fail(reservationFailure("STAND_WRONG_FESTIVAL"));
    }

    const [origin] = await tx
      .select({
        id: stands.id,
        status: stands.status,
        individualPrice: stands.individualPrice,
        sharedPrice: stands.sharedPrice,
      })
      .from(stands)
      .where(eq(stands.id, source.standId))
      .limit(1);
    if (!origin) return fail(reservationFailure("STAND_NOT_FOUND"));

    if (await standHasLiveHold(tx, destination.id, now)) {
      return fail(reservationFailure("STAND_CHANGE_DESTINATION_HELD"));
    }
    if (
      await hasRetiredMemberOnStand(tx, source.reservation.id, destination.id)
    ) {
      return fail(reservationFailure("STAND_CHANGE_NOT_MOVABLE"));
    }

    const counterpartId = await liveReservationIdForStand(
      tx,
      destination.id,
      source.reservation.id,
    );
    if ((counterpartId ?? null) !== (counterpartPreviewId ?? null)) {
      return fail(reservationFailure("CONFLICT_RETRY"));
    }

    const counterpart =
      counterpartId == null
        ? null
        : await readMovableReservation(tx, counterpartId);
    if (counterpartId != null && !counterpart) {
      return fail(reservationFailure("STAND_CHANGE_NOT_MOVABLE"));
    }
    if (counterpart) {
      if (!input.allowExchange) {
        return fail(reservationFailure("STAND_CHANGE_EXCHANGE_NOT_CONFIRMED"));
      }
      if (counterpart.standId !== destination.id) {
        return fail(reservationFailure("CONFLICT_RETRY"));
      }
      if (
        counterpart.reservation.festivalId !== source.reservation.festivalId
      ) {
        return fail(reservationFailure("STAND_WRONG_FESTIVAL"));
      }
      if (
        await hasRetiredMemberOnStand(tx, counterpart.reservation.id, origin.id)
      ) {
        return fail(reservationFailure("STAND_CHANGE_NOT_MOVABLE"));
      }
    }

    const sourcePlan = await buildSidePlan(
      tx,
      source.reservation,
      source.standId,
      destination,
      origin.status,
      input.idempotencyKey,
    );
    const counterpartPlan = counterpart
      ? await buildSidePlan(
          tx,
          counterpart.reservation,
          counterpart.standId,
          origin,
          destination.status,
          input.idempotencyKey,
        )
      : null;

    // Priced and vetted before anything moves. A refusal returns rather than
    // throws, so it must not leave a half-applied move behind it.
    for (const plan of [sourcePlan, counterpartPlan]) {
      if (!plan) continue;
      if (!plan.pricing.priceChanged) continue;
      if (
        await invoicesHaveProofUnderReview(
          tx,
          plan.invoices.map((invoice) => invoice.id),
        )
      ) {
        return fail(reservationFailure("STAND_CHANGE_PROOF_UNDER_REVIEW"));
      }
      // Handing money back needs the credit account locked, and the lock order
      // puts credit accounts before stands — too early to take one now. The
      // preview decides whether to hold it, so a settlement that appeared since
      // then is a conflict rather than an out-of-order lock.
      if (
        plan.settlement.kind === "overpaid" &&
        !lockedCreditUserIds.includes(plan.reservation.ownerUserId ?? -1)
      ) {
        return fail(reservationFailure("CONFLICT_RETRY"));
      }
    }

    if (counterpartPlan) {
      // The parking sequence. Both member rows and both parent pointers are
      // guarded by partial unique indexes on `stand_id`, and Postgres checks a
      // unique index per row as the statement runs — a partial unique
      // constraint cannot be declared DEFERRABLE, so there is no end-of-
      // statement escape. Releasing the counterpart's member first is what
      // frees the destination for the source's member to take.
      await tx
        .update(standReservationStands)
        .set({ releasedAt: now })
        .where(
          and(
            eq(
              standReservationStands.reservationId,
              counterpartPlan.reservation.id,
            ),
            eq(standReservationStands.standId, counterpartPlan.fromStandId),
            isNull(standReservationStands.releasedAt),
          ),
        );
      await moveReservationMember(tx, sourcePlan);
      // Restored onto the origin, same row, so `position` survives and the
      // release above leaves no history row behind.
      const restored = await tx
        .update(standReservationStands)
        .set({ standId: counterpartPlan.toStandId, releasedAt: null })
        .where(
          and(
            eq(
              standReservationStands.reservationId,
              counterpartPlan.reservation.id,
            ),
            eq(standReservationStands.standId, counterpartPlan.fromStandId),
          ),
        )
        .returning({ id: standReservationStands.id });
      if (restored.length !== 1)
        throw new Error("stand_exchange_member_conflict");
    } else {
      await moveReservationMember(tx, sourcePlan);
    }

    await applySidePointerAndMoney(tx, sourcePlan, now);
    if (counterpartPlan) {
      await applySidePointerAndMoney(tx, counterpartPlan, now);
    }

    // Stand statuses carry across with their reservations, so a paid
    // reservation keeps `confirmed` on the stand it moves to.
    await tx
      .update(stands)
      .set({ status: effectiveStandStatus(sourcePlan), updatedAt: now })
      .where(eq(stands.id, sourcePlan.toStandId));
    if (counterpartPlan) {
      await tx
        .update(stands)
        .set({ status: effectiveStandStatus(counterpartPlan), updatedAt: now })
        .where(eq(stands.id, counterpartPlan.toStandId));
    } else {
      // Nothing took the origin, so it goes back on the map — unless something
      // else still occupies it, which `releaseStandIfVacant` is the judge of.
      await releaseStandIfVacant(tx, sourcePlan.fromStandId, now);
    }

    await insertStandReservationEvent(tx, {
      reservationId: sourcePlan.reservation.id,
      actorUserId: actorId,
      eventType: "status_changed",
      fromStatus: sourcePlan.reservation.status,
      toStatus: sourcePlan.reservation.status,
      payload: {
        action: counterpartPlan ? "stand_exchanged" : "stand_switched",
        fromStandId: sourcePlan.fromStandId,
        toStandId: sourcePlan.toStandId,
        fromPrice: sourcePlan.reservation.priceAmountSnapshot,
        toPrice: sourcePlan.pricing.priceAmount,
        counterpartReservationId: counterpartPlan?.reservation.id ?? null,
      },
      idempotencyKey: `stand-change:${input.idempotencyKey}`,
    });
    if (counterpartPlan) {
      await insertStandReservationEvent(tx, {
        reservationId: counterpartPlan.reservation.id,
        actorUserId: actorId,
        eventType: "status_changed",
        fromStatus: counterpartPlan.reservation.status,
        toStatus: counterpartPlan.reservation.status,
        payload: {
          action: "stand_exchanged",
          fromStandId: counterpartPlan.fromStandId,
          toStandId: counterpartPlan.toStandId,
          fromPrice: counterpartPlan.reservation.priceAmountSnapshot,
          toPrice: counterpartPlan.pricing.priceAmount,
          counterpartReservationId: sourcePlan.reservation.id,
        },
        idempotencyKey: `stand-change:${input.idempotencyKey}`,
      });
    }

    await completeRequest(tx, input.idempotencyKey, {
      fromStandId: sourcePlan.fromStandId,
      toStandId: sourcePlan.toStandId,
      counterpartReservationId: counterpartPlan?.reservation.id ?? null,
    });

    return reservationSuccess(
      {
        mode: counterpartPlan ? ("exchange" as const) : ("switch" as const),
        reservationId: sourcePlan.reservation.id,
        fromStandId: sourcePlan.fromStandId,
        toStandId: sourcePlan.toStandId,
        counterpartReservationId: counterpartPlan?.reservation.id ?? null,
      },
      counterpartPlan
        ? "Las dos reservas intercambiaron sus espacios."
        : "La reserva quedó en el nuevo espacio.",
    );
  });
}

/**
 * Rewrites the live member row in place, keeping its `position`.
 *
 * Deliberately not a release-and-insert: `stand_reservation_stands` counts
 * released rows in its `(reservation_id, stand_id)` uniqueness, so a
 * release-and-insert would make a reservation moved A → C → A collide with its
 * own history.
 */
async function moveReservationMember(tx: DbTx, plan: SidePlan) {
  const moved = await tx
    .update(standReservationStands)
    .set({ standId: plan.toStandId })
    .where(
      and(
        eq(standReservationStands.reservationId, plan.reservation.id),
        eq(standReservationStands.standId, plan.fromStandId),
        isNull(standReservationStands.releasedAt),
      ),
    )
    .returning({ id: standReservationStands.id });
  if (moved.length !== 1) throw new Error("stand_change_member_conflict");
}
