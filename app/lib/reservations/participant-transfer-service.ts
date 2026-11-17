import "server-only";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import {
  personName,
  reservationHolderId,
} from "@/app/lib/participations/admin-history";
import {
  adminReservationFailure,
  reservationSuccess,
  type ReservationActionResult,
  type ReservationErrorCode,
} from "@/app/lib/reservations/errors";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import {
  lockParticipantsBeforeRegistryClaim,
  lockReservationAggregate,
  sameIdSet,
  uniqueSortedIds,
} from "@/app/lib/reservations/locks";
import { activeReservationStandIds } from "@/app/lib/reservations/members";
import { roundMoney } from "@/app/lib/reservations/money";
import {
  decideParticipantTransfer,
  isLiveTransfer,
  type TransferPlan,
  type TransferSnapshot,
} from "@/app/lib/reservations/participant-transfer";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import {
  abandonRequest,
  claimRequest,
  completeRequest,
} from "@/app/lib/reservations/request-registry";
import { getReservationEligibility } from "@/app/lib/sanctions/reservation-eligibility";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  creditLedgerEntries,
  festivalActivities,
  festivalActivityDetails,
  festivalActivityParticipants,
  festivals,
  invoiceCreditAllocations,
  invoices,
  participantProducts,
  pendingUserDeletions,
  reservationFeatureActions,
  reservationParticipants,
  scheduledTasks,
  standReservations,
  userRequests,
  users,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TransferInput = {
  reservationId: number;
  fromUserId: number;
  toUserId: number;
};

type TransferAccount = { id: number; name: string; email: string };

export type TransferPreview = {
  reservationId: number;
  festivalName: string;
  status: string;
  from: TransferAccount;
  to: TransferAccount;
  plan: TransferPlan;
};

export type TransferResult = ReservationActionResult<{
  reservationId: number;
  participationId: number;
  fromUserId: number;
  toUserId: number;
}>;

const LIVE_STATUSES = ["pending", "verification_payment", "accepted"] as const;

/**
 * The admin message for a refusal. The sanction code's default text addresses
 * the participant ("No podés reservar…"); here the reader is the admin and the
 * subject is the account they picked.
 */
function transferFailure(code: ReservationErrorCode) {
  return code === "SANCTION_BLOCKED"
    ? adminReservationFailure(
        code,
        "La cuenta de destino tiene una sanción activa que no le permite participar en este festival.",
      )
    : adminReservationFailure(code);
}

/**
 * Everything the transfer rules read, plus the ids the write needs.
 *
 * Read twice by the command: once before any lock, to know which rows to lock,
 * and again under them, so the decision is made against the rows it writes.
 */
async function readTransferState(tx: DbTx, input: TransferInput) {
  const [reservation] = await tx
    .select({
      id: standReservations.id,
      festivalId: standReservations.festivalId,
      standId: standReservations.standId,
      status: standReservations.status,
      ownerUserId: standReservations.ownerUserId,
      festivalName: festivals.name,
      festivalStatus: festivals.status,
    })
    .from(standReservations)
    .innerJoin(festivals, eq(festivals.id, standReservations.festivalId))
    .where(eq(standReservations.id, input.reservationId))
    .limit(1);
  if (!reservation) return null;

  const [participants, invoiceRows, memberStandIds] = await Promise.all([
    tx
      .select({
        id: reservationParticipants.id,
        userId: reservationParticipants.userId,
      })
      .from(reservationParticipants)
      .where(eq(reservationParticipants.reservationId, reservation.id)),
    tx
      .select({ id: invoices.id, userId: invoices.userId })
      .from(invoices)
      .where(eq(invoices.reservationId, reservation.id))
      .orderBy(asc(invoices.id)),
    activeReservationStandIds(tx, reservation.id),
  ]);

  const sourceParticipation =
    participants.find((row) => row.userId === input.fromUserId) ?? null;
  const sourceInvoiceIds = invoiceRows
    .filter((row) => row.userId === input.fromUserId)
    .map((row) => row.id);

  const accountRows = await tx
    .select({
      id: users.id,
      role: users.role,
      status: users.status,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(
      inArray(users.id, uniqueSortedIds([input.fromUserId, input.toUserId])),
    );
  const source = accountRows.find((row) => row.id === input.fromUserId) ?? null;
  const target = accountRows.find((row) => row.id === input.toUserId) ?? null;

  const [
    taskRows,
    productRows,
    targetLiveRows,
    sourceOtherRows,
    enrollmentRows,
    activeFeatureRows,
    creditRows,
    activityRows,
    targetDeletionRows,
  ] = await Promise.all([
    tx
      .select({ id: scheduledTasks.id })
      .from(scheduledTasks)
      .where(
        and(
          eq(scheduledTasks.reservationId, reservation.id),
          eq(scheduledTasks.profileId, input.fromUserId),
        ),
      ),
    sourceParticipation
      ? tx
          .select({ id: participantProducts.id })
          .from(participantProducts)
          .where(
            eq(participantProducts.participationId, sourceParticipation.id),
          )
      : Promise.resolve([]),
    tx
      .select({ id: standReservations.id })
      .from(reservationParticipants)
      .innerJoin(
        standReservations,
        eq(standReservations.id, reservationParticipants.reservationId),
      )
      .where(
        and(
          eq(reservationParticipants.userId, input.toUserId),
          eq(standReservations.festivalId, reservation.festivalId),
          ne(standReservations.id, reservation.id),
          inArray(standReservations.status, [...LIVE_STATUSES]),
        ),
      )
      .limit(1),
    tx
      .select({ id: standReservations.id })
      .from(reservationParticipants)
      .innerJoin(
        standReservations,
        eq(standReservations.id, reservationParticipants.reservationId),
      )
      .where(
        and(
          eq(reservationParticipants.userId, input.fromUserId),
          eq(standReservations.festivalId, reservation.festivalId),
          ne(standReservations.id, reservation.id),
        ),
      )
      .limit(1),
    tx
      .select({
        id: userRequests.id,
        userId: userRequests.userId,
        status: userRequests.status,
      })
      .from(userRequests)
      .where(
        and(
          inArray(userRequests.userId, [input.fromUserId, input.toUserId]),
          eq(userRequests.festivalId, reservation.festivalId),
          eq(userRequests.type, "festival_participation"),
        ),
      ),
    tx
      .select({ id: reservationFeatureActions.id })
      .from(reservationFeatureActions)
      .where(
        and(
          eq(reservationFeatureActions.reservationId, reservation.id),
          eq(reservationFeatureActions.status, "active"),
        ),
      ),
    invoiceRows.length === 0
      ? Promise.resolve([])
      : tx
          .select({ amount: invoiceCreditAllocations.amount })
          .from(invoiceCreditAllocations)
          .where(
            and(
              inArray(
                invoiceCreditAllocations.invoiceId,
                invoiceRows.map((row) => row.id),
              ),
              eq(invoiceCreditAllocations.userId, input.fromUserId),
              // Reversed spends are history, not money on the cobro.
              sql`NOT EXISTS (
                SELECT 1 FROM ${creditLedgerEntries} r
                WHERE r.reverses_entry_id = ${invoiceCreditAllocations.ledgerEntryId}
              )`,
            ),
          ),
    tx
      .select({ id: festivalActivityParticipants.id })
      .from(festivalActivityParticipants)
      .innerJoin(
        festivalActivityDetails,
        eq(festivalActivityDetails.id, festivalActivityParticipants.detailsId),
      )
      .innerJoin(
        festivalActivities,
        eq(festivalActivities.id, festivalActivityDetails.activityId),
      )
      .where(
        and(
          eq(festivalActivityParticipants.userId, input.fromUserId),
          eq(festivalActivities.festivalId, reservation.festivalId),
          isNull(festivalActivityParticipants.removedAt),
        ),
      ),
    // Read again under the aggregate lock, which holds the target's users row
    // FOR UPDATE — the row deleteProfile locks while it records the pending
    // deletion — so the two cannot pass each other.
    tx
      .select({ id: pendingUserDeletions.id })
      .from(pendingUserDeletions)
      .where(
        and(
          eq(pendingUserDeletions.userId, input.toUserId),
          isNull(pendingUserDeletions.localDeletedAt),
        ),
      )
      .limit(1),
  ]);

  const enrollmentOf = (userId: number) => {
    const row = enrollmentRows.find((item) => item.userId === userId);
    return row ? { id: row.id, status: row.status } : null;
  };

  const live = isLiveTransfer({
    status: reservation.status,
    festivalStatus: reservation.festivalStatus,
  });
  const targetSanctionBlocked =
    live && target
      ? !(
          await getReservationEligibility(
            { userId: target.id, festivalId: reservation.festivalId },
            tx,
          )
        ).eligible
      : false;

  const snapshot: TransferSnapshot = {
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    reservation: {
      status: reservation.status,
      festivalStatus: reservation.festivalStatus,
    },
    participantUserIds: participants.map((row) => row.userId),
    holderUserId: reservationHolderId({
      ownerUserId: reservation.ownerUserId,
      invoices: invoiceRows,
      participants,
    }),
    target: target
      ? {
          id: target.id,
          role: target.role,
          status: target.status,
          deletionPending: targetDeletionRows.length > 0,
        }
      : null,
    targetHasLiveReservationInFestival: targetLiveRows.length > 0,
    targetSanctionBlocked,
    activeFeatureActionCount: activeFeatureRows.length,
    creditsAppliedFromSource: roundMoney(
      creditRows.reduce((sum, row) => sum + Number(row.amount), 0),
    ),
    sourceActivitySignups: activityRows.length,
    enrollment: {
      from: enrollmentOf(input.fromUserId),
      to: enrollmentOf(input.toUserId),
      fromHasOtherParticipationInFestival: sourceOtherRows.length > 0,
    },
    counts: {
      invoices: sourceInvoiceIds.length,
      scheduledTasks: taskRows.length,
      products: productRows.length,
    },
  };

  const account = (
    row: (typeof accountRows)[number] | null,
  ): TransferAccount | null =>
    row ? { id: row.id, name: personName(row), email: row.email } : null;

  return {
    reservation,
    snapshot,
    source: account(source),
    target: account(target),
    sourceParticipationId: sourceParticipation?.id ?? null,
    participantUserIds: participants.map((row) => row.userId),
    invoiceIds: invoiceRows.map((row) => row.id),
    invoiceUserIds: invoiceRows.map((row) => row.userId),
    sourceInvoiceIds,
    scheduledTaskIds: taskRows.map((row) => row.id),
    // The parent pointer too: the aggregate lock refuses a reservation whose
    // `stand_id` is outside the set, and a closed one has no live member.
    standIds: uniqueSortedIds([...memberStandIds, reservation.standId]),
  };
}

/**
 * What a transfer would do, for the dialog the admin confirms. Judged by the
 * same rules as the command, so a refusal shows before anyone confirms.
 */
export async function previewParticipantTransfer(
  input: TransferInput,
): Promise<ReservationActionResult<TransferPreview>> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return adminReservationFailure("UNAUTHORIZED");
  }

  // One transaction for one consistent read; nothing here writes.
  const state = await db.transaction((tx) => readTransferState(tx, input));
  if (!state) return adminReservationFailure("TRANSFER_NOT_PARTICIPANT");

  const decision = decideParticipantTransfer(state.snapshot);
  if (!decision.ok) return transferFailure(decision.code);
  // Both exist once the rules pass: the source is a participant and the
  // target was found.
  if (!state.source || !state.target) {
    return adminReservationFailure("TRANSFER_TARGET_NOT_FOUND");
  }

  return reservationSuccess(
    {
      reservationId: state.reservation.id,
      festivalName: state.reservation.festivalName,
      status: state.reservation.status,
      from: state.source,
      to: state.target,
      plan: decision.plan,
    },
    "Vista previa lista",
  );
}

/**
 * Moves one account's participation in a reservation to another account.
 *
 * For a participant who lost access to the account they used and kept
 * participating from a new one: the reservation, its stand, price and status
 * do not change — only who is on it. See `participant-transfer.ts` for what
 * moves and what deliberately stays.
 *
 * Idempotent on `idempotencyKey` through the request registry, so a retry of a
 * transfer whose answer was lost replays its success instead of reporting that
 * the old account is no longer on the reservation.
 */
export async function transferReservationParticipation(
  input: TransferInput & { idempotencyKey: string; note?: string | null },
): Promise<TransferResult> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return adminReservationFailure("UNAUTHORIZED");
  }
  const actorId = actor.id;
  const note = input.note?.trim() || null;

  return db.transaction(async (tx) => {
    // Judgement-free until the claim, like the other admin commands: a replay
    // of a finished transfer must not trip on "not a participant", which is
    // exactly what success leaves behind.
    const preview = await readTransferState(tx, input);
    if (!preview) return adminReservationFailure("TRANSFER_NOT_PARTICIPANT");

    const previewUserIds = uniqueSortedIds([
      ...preview.participantUserIds,
      ...(preview.reservation.ownerUserId != null
        ? [preview.reservation.ownerUserId]
        : []),
      ...preview.invoiceUserIds,
      input.fromUserId,
      ...(preview.target ? [input.toUserId] : []),
    ]);

    await lockParticipantsBeforeRegistryClaim(
      tx,
      preview.reservation.festivalId,
      previewUserIds,
    );

    const claim = await claimRequest(tx, {
      requestKey: input.idempotencyKey,
      operation: "transferReservationParticipation",
      actorUserId: actorId,
      scope: {
        reservationId: input.reservationId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
      },
    });
    if (claim.kind === "conflict") {
      return adminReservationFailure("CONFLICT_RETRY");
    }
    if (claim.kind === "replayed") {
      const participationId = claim.resultIds.participationId;
      if (typeof participationId !== "number") {
        return adminReservationFailure("CONFLICT_RETRY");
      }
      return reservationSuccess(
        {
          reservationId: input.reservationId,
          participationId,
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
        },
        "La participación ya fue transferida.",
      );
    }

    const fail = async (
      failure: Extract<ReservationActionResult, { success: false }>,
    ) => {
      await abandonRequest(tx, input.idempotencyKey);
      return failure;
    };

    const early = decideParticipantTransfer(preview.snapshot);
    if (!early.ok) return fail(transferFailure(early.code));

    const locked = await lockReservationAggregate(tx, {
      festivalId: preview.reservation.festivalId,
      userIds: previewUserIds,
      standIds: preview.standIds,
      reservationIds: [preview.reservation.id],
      invoiceIds: preview.invoiceIds,
      scheduledTaskIds: preview.scheduledTaskIds,
    });
    if (!locked.ok) return fail(adminReservationFailure("CONFLICT_RETRY"));

    // Re-read under the locks and decide again: the write uses these rows.
    const state = await readTransferState(tx, input);
    if (
      !state ||
      !sameIdSet(state.participantUserIds, preview.participantUserIds) ||
      !sameIdSet(state.invoiceIds, preview.invoiceIds) ||
      !sameIdSet(state.scheduledTaskIds, preview.scheduledTaskIds) ||
      state.reservation.ownerUserId !== preview.reservation.ownerUserId
    ) {
      return fail(adminReservationFailure("CONFLICT_RETRY"));
    }
    const decision = decideParticipantTransfer(state.snapshot);
    if (!decision.ok) return fail(transferFailure(decision.code));
    const participationId = state.sourceParticipationId;
    if (participationId == null) {
      return fail(adminReservationFailure("TRANSFER_NOT_PARTICIPANT"));
    }

    const now = new Date();
    const { plan } = decision;

    // The row moves rather than being recreated: its id is what the products
    // and the stamp hang from.
    await tx
      .update(reservationParticipants)
      .set({ userId: input.toUserId, updatedAt: now })
      .where(eq(reservationParticipants.id, participationId));

    await tx
      .update(participantProducts)
      .set({ userId: input.toUserId, updatedAt: now })
      .where(eq(participantProducts.participationId, participationId));

    // Written whenever the holding moves, not only when the old account was
    // the recorded owner: a legacy row with no owner and no cobro derives its
    // holder from the lowest participant id, which could otherwise hand the
    // reservation to the companion.
    if (plan.movesHolding) {
      await tx
        .update(standReservations)
        .set({ ownerUserId: input.toUserId, updatedAt: now })
        .where(eq(standReservations.id, state.reservation.id));
    }

    if (state.sourceInvoiceIds.length > 0) {
      await tx
        .update(invoices)
        .set({ userId: input.toUserId, updatedAt: now })
        .where(inArray(invoices.id, state.sourceInvoiceIds));
    }

    if (state.scheduledTaskIds.length > 0) {
      await tx
        .update(scheduledTasks)
        .set({ profileId: input.toUserId, updatedAt: now })
        .where(inArray(scheduledTasks.id, state.scheduledTaskIds));
    }

    const sourceEnrollment = state.snapshot.enrollment.from;
    if (plan.enrollment === "move" && sourceEnrollment) {
      await tx
        .update(userRequests)
        .set({ userId: input.toUserId, updatedAt: now })
        .where(eq(userRequests.id, sourceEnrollment.id));
    } else if (plan.enrollment === "copy" && sourceEnrollment) {
      const [original] = await tx
        .select()
        .from(userRequests)
        .where(eq(userRequests.id, sourceEnrollment.id))
        .limit(1);
      if (original) {
        await tx
          .insert(userRequests)
          .values({
            userId: input.toUserId,
            festivalId: original.festivalId,
            type: original.type,
            status: original.status,
            termsVersionId: original.termsVersionId,
          })
          .onConflictDoNothing();
      }
    }

    await insertStandReservationEvent(tx, {
      reservationId: state.reservation.id,
      actorUserId: actorId,
      // The codebase's convention for a new admin action: an existing event
      // type, told apart by `payload.kind`, rather than a new enum label.
      eventType: "status_changed",
      fromStatus: state.reservation.status,
      toStatus: state.reservation.status,
      payload: {
        kind: "participant_transferred",
        participationId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        movedOwnership: plan.movesHolding,
        invoiceIds: state.sourceInvoiceIds,
        scheduledTaskIds: state.scheduledTaskIds,
        enrollment: plan.enrollment,
        reason: note,
      },
      idempotencyKey: input.idempotencyKey,
    });

    await completeRequest(tx, input.idempotencyKey, { participationId });

    return reservationSuccess(
      {
        reservationId: state.reservation.id,
        participationId,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
      },
      "Participación transferida",
    );
  });
}
