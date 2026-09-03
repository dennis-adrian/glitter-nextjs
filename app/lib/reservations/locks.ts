import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { FESTIVAL_TERMS_DOCUMENT_SLUG } from "@/app/lib/festival-terms/constants";
import { db } from "@/db";
import {
  creditAccounts,
  festivals,
  invoiceSettlementSubmissions,
  invoices,
  payments,
  reservationParticipants,
  scheduledTasks,
  standHolds,
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Distinct from tickets (4711) and festival-terms (5822). */
export const RESERVATION_PARTICIPANT_LOCK_NAMESPACE = 6933;

/** Must match the terms-publication lock in `festival-terms/persist.ts`. */
export const FESTIVAL_TERMS_LOCK_NAMESPACE = 5822;

export function uniqueSortedIds(ids: readonly number[]): number[] {
  return [
    ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
  ].sort((a, b) => a - b);
}

export function sameIdSet(
  left: readonly number[],
  right: readonly number[],
): boolean {
  const a = uniqueSortedIds(left);
  const b = uniqueSortedIds(right);
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export type ReservationAggregatePreview = {
  festivalId: number;
  userIds: readonly number[];
  /**
   * Credit accounts participate in the wider reservation/credit lock order.
   * They must be locked after users/enrollment and before stand capacity.
   */
  creditAccountUserIds?: readonly number[];
  standIds: readonly number[];
  holdIds?: readonly number[];
  reservationIds?: readonly number[];
  invoiceIds?: readonly number[];
  paymentIds?: readonly number[];
  submissionIds?: readonly number[];
  scheduledTaskIds?: readonly number[];
};

export type LockedReservationAggregate = {
  festivalId: number;
  userIds: number[];
  creditAccountUserIds: number[];
  standIds: number[];
  holdIds: number[];
  reservationIds: number[];
  invoiceIds: number[];
  paymentIds: number[];
  submissionIds: number[];
  scheduledTaskIds: number[];
  participantsByReservationId: Map<number, number[]>;
};

async function lockIdColumn(
  tx: DbTx,
  selectAndLock: (id: number) => Promise<{ id: number } | undefined>,
  ids: readonly number[],
) {
  const locked: number[] = [];
  for (const id of uniqueSortedIds(ids)) {
    const row = await selectAndLock(id);
    if (row) locked.push(row.id);
  }
  return locked;
}

export async function lockParticipants(
  tx: DbTx,
  festivalId: number,
  userIds: readonly number[],
) {
  for (const userId of uniqueSortedIds(userIds)) {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${RESERVATION_PARTICIPANT_LOCK_NAMESPACE}, hashtext(${`${festivalId}:${userId}`}))`,
    );
  }
}

/**
 * Registry inserts take a foreign-key share-lock on `actor_user_id`.
 * Call this before `claimRequest` so that share-lock cannot deadlock with a
 * later `users` FOR UPDATE in the canonical aggregate.
 */
export async function lockParticipantsBeforeRegistryClaim(
  tx: DbTx,
  festivalId: number,
  userIds: readonly number[],
) {
  await lockParticipants(tx, festivalId, userIds);
}

export async function lockFestivalRow(tx: DbTx, festivalId: number) {
  const [row] = await tx
    .select({ id: festivals.id })
    .from(festivals)
    .where(eq(festivals.id, festivalId))
    .limit(1)
    .for("update");
  return row ?? null;
}

export async function lockFestivalTermsDocument(tx: DbTx) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${FESTIVAL_TERMS_LOCK_NAMESPACE}, hashtext(${FESTIVAL_TERMS_DOCUMENT_SLUG}))`,
  );
}

export async function lockUserRows(tx: DbTx, userIds: readonly number[]) {
  await lockIdColumn(
    tx,
    async (id) => {
      const [row] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, id))
        .limit(1)
        .for("update");
      return row;
    },
    userIds,
  );
}

export async function lockParticipantEligibilityRows(
  tx: DbTx,
  festivalId: number,
  userIds: readonly number[],
) {
  const unique = uniqueSortedIds(userIds);
  for (const userId of unique) {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");
  }
  for (const userId of unique) {
    await tx
      .select({ id: userRequests.id })
      .from(userRequests)
      .where(
        and(
          eq(userRequests.userId, userId),
          eq(userRequests.festivalId, festivalId),
        ),
      )
      .orderBy(userRequests.id)
      .for("update");
  }
}

/**
 * Locks each account in ascending user order, creating its zero-balance
 * projection first when needed. This is deliberately available to combined
 * reservation/credit transactions; callers must already hold user locks.
 */
export async function lockCreditAccountRows(
  tx: DbTx,
  userIds: readonly number[],
) {
  return lockIdColumn(
    tx,
    async (userId) => {
      await tx
        .insert(creditAccounts)
        .values({ userId })
        .onConflictDoNothing({ target: creditAccounts.userId });
      const [row] = await tx
        .select({ id: creditAccounts.userId })
        .from(creditAccounts)
        .where(eq(creditAccounts.userId, userId))
        .limit(1)
        .for("update");
      return row;
    },
    userIds,
  );
}

export async function lockStandRows(tx: DbTx, standIds: readonly number[]) {
  return lockIdColumn(
    tx,
    async (id) => {
      const [row] = await tx
        .select({ id: stands.id })
        .from(stands)
        .where(eq(stands.id, id))
        .limit(1)
        .for("update");
      return row;
    },
    standIds,
  );
}

export async function lockHoldRows(tx: DbTx, holdIds: readonly number[]) {
  return lockIdColumn(
    tx,
    async (id) => {
      const [row] = await tx
        .select({ id: standHolds.id })
        .from(standHolds)
        .where(eq(standHolds.id, id))
        .limit(1)
        .for("update");
      return row;
    },
    holdIds,
  );
}

export async function lockReservationRows(
  tx: DbTx,
  reservationIds: readonly number[],
) {
  return lockIdColumn(
    tx,
    async (id) => {
      const [row] = await tx
        .select({ id: standReservations.id })
        .from(standReservations)
        .where(eq(standReservations.id, id))
        .limit(1)
        .for("update");
      return row;
    },
    reservationIds,
  );
}

export async function lockInvoiceRows(tx: DbTx, invoiceIds: readonly number[]) {
  return lockIdColumn(
    tx,
    async (id) => {
      const [row] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1)
        .for("update");
      return row;
    },
    invoiceIds,
  );
}

export async function lockPaymentRows(tx: DbTx, paymentIds: readonly number[]) {
  return lockIdColumn(
    tx,
    async (id) => {
      const [row] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.id, id))
        .limit(1)
        .for("update");
      return row;
    },
    paymentIds,
  );
}

export async function lockSettlementRows(
  tx: DbTx,
  submissionIds: readonly number[],
) {
  return lockIdColumn(
    tx,
    async (id) => {
      const [row] = await tx
        .select({ id: invoiceSettlementSubmissions.id })
        .from(invoiceSettlementSubmissions)
        .where(eq(invoiceSettlementSubmissions.id, id))
        .limit(1)
        .for("update");
      return row;
    },
    submissionIds,
  );
}

export async function lockUserRequestRows(
  tx: DbTx,
  requestIds: readonly number[],
) {
  return lockIdColumn(
    tx,
    async (id) => {
      const [row] = await tx
        .select({ id: userRequests.id })
        .from(userRequests)
        .where(eq(userRequests.id, id))
        .limit(1)
        .for("update");
      return row;
    },
    requestIds,
  );
}

export async function lockScheduledTaskRows(
  tx: DbTx,
  taskIds: readonly number[],
) {
  return lockIdColumn(
    tx,
    async (id) => {
      const [row] = await tx
        .select({ id: scheduledTasks.id })
        .from(scheduledTasks)
        .where(eq(scheduledTasks.id, id))
        .limit(1)
        .for("update");
      return row;
    },
    taskIds,
  );
}

export async function readReservationParticipantIds(
  tx: DbTx,
  reservationId: number,
) {
  const participants = await tx
    .select({ userId: reservationParticipants.userId })
    .from(reservationParticipants)
    .where(eq(reservationParticipants.reservationId, reservationId));
  return participants.map((participant) => participant.userId);
}

/**
 * Canonical reservation write-set lock order (§4.4 / paid-reservation GUIDE §3):
 * advisory keys → festival → terms → eligibility rows → credit accounts →
 * stands → holds → reservations → invoices → payments → settlements →
 * scheduled tasks.
 * Re-reads membership and relationships and returns `{ ok: false }` when they
 * changed, so the caller can return CONFLICT_RETRY without writes.
 */
export async function lockReservationAggregate(
  tx: DbTx,
  preview: ReservationAggregatePreview,
): Promise<{ ok: true; locked: LockedReservationAggregate } | { ok: false }> {
  const festivalId = preview.festivalId;
  const previewUserIds = uniqueSortedIds(preview.userIds);
  const previewCreditAccountUserIds = uniqueSortedIds(
    preview.creditAccountUserIds ?? [],
  );
  const previewStandIds = uniqueSortedIds(preview.standIds);
  const previewHoldIds = uniqueSortedIds(preview.holdIds ?? []);
  const previewReservationIds = uniqueSortedIds(preview.reservationIds ?? []);
  const previewInvoiceIds = uniqueSortedIds(preview.invoiceIds ?? []);
  const previewPaymentIds = uniqueSortedIds(preview.paymentIds ?? []);
  const previewSubmissionIds = uniqueSortedIds(preview.submissionIds ?? []);
  const previewTaskIds = uniqueSortedIds(preview.scheduledTaskIds ?? []);

  if (!previewCreditAccountUserIds.every((id) => previewUserIds.includes(id))) {
    return { ok: false };
  }

  await lockParticipants(tx, festivalId, previewUserIds);
  const festival = await lockFestivalRow(tx, festivalId);
  if (!festival) return { ok: false };
  await lockFestivalTermsDocument(tx);
  await lockParticipantEligibilityRows(tx, festivalId, previewUserIds);
  const lockedCreditAccountUserIds = await lockCreditAccountRows(
    tx,
    previewCreditAccountUserIds,
  );
  const lockedStandIds = await lockStandRows(tx, previewStandIds);
  const lockedHoldIds = await lockHoldRows(tx, previewHoldIds);
  const lockedReservationIds = await lockReservationRows(
    tx,
    previewReservationIds,
  );
  const lockedInvoiceIds = await lockInvoiceRows(tx, previewInvoiceIds);
  const lockedPaymentIds = await lockPaymentRows(tx, previewPaymentIds);
  const lockedSubmissionIds = await lockSettlementRows(
    tx,
    previewSubmissionIds,
  );
  const lockedTaskIds = await lockScheduledTaskRows(tx, previewTaskIds);

  if (!sameIdSet(lockedStandIds, previewStandIds)) return { ok: false };
  if (
    !sameIdSet(lockedCreditAccountUserIds, previewCreditAccountUserIds)
  ) {
    return { ok: false };
  }
  if (
    previewReservationIds.length > 0 &&
    !sameIdSet(lockedReservationIds, previewReservationIds)
  ) {
    return { ok: false };
  }
  if (
    previewInvoiceIds.length > 0 &&
    !sameIdSet(lockedInvoiceIds, previewInvoiceIds)
  ) {
    return { ok: false };
  }
  if (
    previewPaymentIds.length > 0 &&
    !sameIdSet(lockedPaymentIds, previewPaymentIds)
  ) {
    return { ok: false };
  }
  if (
    previewSubmissionIds.length > 0 &&
    !sameIdSet(lockedSubmissionIds, previewSubmissionIds)
  ) {
    return { ok: false };
  }

  const participantsByReservationId = new Map<number, number[]>();
  const discoveredUserIds: number[] = [...previewUserIds];

  for (const reservationId of lockedReservationIds) {
    const [reservation] = await tx
      .select({
        id: standReservations.id,
        festivalId: standReservations.festivalId,
        standId: standReservations.standId,
        ownerUserId: standReservations.ownerUserId,
      })
      .from(standReservations)
      .where(eq(standReservations.id, reservationId))
      .limit(1);
    if (!reservation) return { ok: false };
    if (reservation.festivalId !== festivalId) return { ok: false };
    if (!previewStandIds.includes(reservation.standId)) return { ok: false };
    const participantIds = await readReservationParticipantIds(
      tx,
      reservation.id,
    );
    participantsByReservationId.set(reservation.id, participantIds);
    discoveredUserIds.push(...participantIds);
    if (reservation.ownerUserId != null) {
      discoveredUserIds.push(reservation.ownerUserId);
    }
  }

  for (const holdId of lockedHoldIds) {
    const [hold] = await tx
      .select({
        id: standHolds.id,
        festivalId: standHolds.festivalId,
        standId: standHolds.standId,
        userId: standHolds.userId,
      })
      .from(standHolds)
      .where(eq(standHolds.id, holdId))
      .limit(1);
    if (!hold) continue;
    if (hold.festivalId !== festivalId) return { ok: false };
    if (!previewStandIds.includes(hold.standId)) return { ok: false };
    discoveredUserIds.push(hold.userId);
  }

  for (const invoiceId of lockedInvoiceIds) {
    const [invoice] = await tx
      .select({
        id: invoices.id,
        reservationId: invoices.reservationId,
        userId: invoices.userId,
      })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);
    if (!invoice) return { ok: false };
    if (
      previewReservationIds.length > 0 &&
      !previewReservationIds.includes(invoice.reservationId)
    ) {
      return { ok: false };
    }
    discoveredUserIds.push(invoice.userId);
  }

  for (const paymentId of lockedPaymentIds) {
    const [payment] = await tx
      .select({ invoiceId: payments.invoiceId })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);
    if (!payment) return { ok: false };
    if (
      previewInvoiceIds.length > 0 &&
      !previewInvoiceIds.includes(payment.invoiceId)
    ) {
      return { ok: false };
    }
  }

  for (const submissionId of lockedSubmissionIds) {
    const [submission] = await tx
      .select({ invoiceId: invoiceSettlementSubmissions.invoiceId })
      .from(invoiceSettlementSubmissions)
      .where(eq(invoiceSettlementSubmissions.id, submissionId))
      .limit(1);
    if (!submission) return { ok: false };
    if (
      previewInvoiceIds.length > 0 &&
      !previewInvoiceIds.includes(submission.invoiceId)
    ) {
      return { ok: false };
    }
  }

  const lockedUserIds = uniqueSortedIds(discoveredUserIds);
  if (!sameIdSet(lockedUserIds, previewUserIds)) return { ok: false };

  return {
    ok: true,
    locked: {
      festivalId,
      userIds: lockedUserIds,
      creditAccountUserIds: lockedCreditAccountUserIds,
      standIds: lockedStandIds,
      holdIds: lockedHoldIds,
      reservationIds: lockedReservationIds,
      invoiceIds: lockedInvoiceIds,
      paymentIds: lockedPaymentIds,
      submissionIds: lockedSubmissionIds,
      scheduledTaskIds: lockedTaskIds,
      participantsByReservationId,
    },
  };
}
