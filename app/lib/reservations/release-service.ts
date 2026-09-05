import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { spendCreditsForFeatureInTx } from "@/app/lib/credits/service";
import { fetchFeatureConfig } from "@/app/lib/festivals/feature-config-service";
import {
  type ReservationActionResult,
  reservationFailure,
  reservationSuccess,
} from "@/app/lib/reservations/errors";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import { getInvoiceTenderTotalsInTx } from "@/app/lib/reservations/payment-service";
import {
  lockParticipantsBeforeRegistryClaim,
  lockReservationAggregate,
  readReservationParticipantIds,
  sameIdSet,
  uniqueSortedIds,
} from "@/app/lib/reservations/locks";
import {
  activeReservationStandIds,
  releaseReservationMember,
} from "@/app/lib/reservations/members";
import { enqueueReservationNotification } from "@/app/lib/reservations/notification-queue";
import { releaseStandIfVacant } from "@/app/lib/reservations/occupancy";
import { statusAllowsRelease } from "@/app/lib/reservations/participant-status";
import {
  abandonRequest,
  claimRequest,
  completeRequest,
} from "@/app/lib/reservations/request-registry";
import { denySelfServiceMutation } from "@/app/lib/reservations/tx-eligibility";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  invoices,
  reservationFeatureActions,
  scheduledTasks,
  standReservations,
  users,
} from "@/db/schema";

/**
 * Give up an unpaid reservation for a fee (PRD §9).
 *
 * This is a change fee, not a way back from a block. Someone who picked the
 * wrong sector, or would rather join another illustrator as their partner,
 * pays credits to hand the stand back and free themselves to book again. The
 * fee is what stops it being an unlimited stand swap.
 *
 * `pending` only. A voucher under review or a paid reservation would make this
 * a refund decision, which is the one thing that would stop it being safe as
 * self-service.
 */
export async function releaseReservation(input: {
  reservationId: number;
  idempotencyKey: string;
}): Promise<
  ReservationActionResult<{ releasedStandIds: number[]; jobIds: number[] }>
> {
  const actor = await getCurrentUserProfile();
  if (!actor) return reservationFailure("UNAUTHENTICATED");

  return db.transaction(async (tx) => {
    const [preview] = await tx
      .select({
        id: standReservations.id,
        festivalId: standReservations.festivalId,
        status: standReservations.status,
        ownerUserId: standReservations.ownerUserId,
      })
      .from(standReservations)
      .where(eq(standReservations.id, input.reservationId))
      .limit(1);
    if (!preview) return reservationFailure("STAND_NOT_FOUND");

    // Ownership before anything else: a partner on the reservation must not be
    // able to give away a stand that is not theirs to give.
    if (preview.ownerUserId !== actor.id) {
      return reservationFailure("UNAUTHORIZED");
    }

    const previewUserIds = uniqueSortedIds([
      ...(await readReservationParticipantIds(tx, preview.id)),
      actor.id,
    ]);
    await lockParticipantsBeforeRegistryClaim(
      tx,
      preview.festivalId,
      previewUserIds,
    );

    // Claimed before validation so a retry replays its result rather than
    // failing because the reservation is now released — the same reason the
    // full-table activation claims first.
    const claim = await claimRequest(tx, {
      requestKey: input.idempotencyKey,
      operation: "releaseReservation",
      actorUserId: actor.id,
      scope: { reservationId: input.reservationId },
    });
    if (claim.kind === "conflict") return reservationFailure("CONFLICT_RETRY");
    if (claim.kind === "replayed") {
      const released = claim.resultIds.releasedStandIds;
      return reservationSuccess(
        {
          releasedStandIds:
            typeof released === "string"
              ? released.split(",").map(Number).filter(Number.isInteger)
              : [],
          // A replay already sent the mail; the outbox would dedupe it anyway,
          // but there is no reason to hand the caller jobs to re-run.
          jobIds: [],
        },
        "Liberaste tu reserva.",
      );
    }

    const fail = async (result: ReturnType<typeof reservationFailure>) => {
      await abandonRequest(tx, input.idempotencyKey);
      return result;
    };

    if (!statusAllowsRelease(preview.status)) {
      return fail(reservationFailure("RELEASE_NOT_PENDING"));
    }

    // Read on this transaction's connection: reaching for the pool while
    // holding participant locks can self-deadlock under load.
    const config = await fetchFeatureConfig(
      preview.festivalId,
      "reservation_release",
      null,
      new Date(),
      tx,
    );
    if (!config || !config.enabled || !config.available) {
      return fail(reservationFailure("RELEASE_UNAVAILABLE"));
    }

    const previewStandIds = await activeReservationStandIds(tx, preview.id);
    const invoiceRows = await tx
      .select({ id: invoices.id, amount: invoices.amount })
      .from(invoices)
      .where(eq(invoices.reservationId, preview.id));

    const locked = await lockReservationAggregate(tx, {
      festivalId: preview.festivalId,
      userIds: previewUserIds,
      standIds: previewStandIds,
      reservationIds: [preview.id],
      invoiceIds: invoiceRows.map((row) => row.id),
    });
    if (!locked.ok) return fail(reservationFailure("CONFLICT_RETRY"));

    // Everything below is re-read under the locks. The status recheck is the
    // one that matters: a participant who submits a payment proof while the
    // confirmation dialog is open must find the release refused, not applied
    // to a reservation that is now awaiting verification.
    const [reservation] = await tx
      .select({
        id: standReservations.id,
        status: standReservations.status,
        ownerUserId: standReservations.ownerUserId,
      })
      .from(standReservations)
      .where(eq(standReservations.id, preview.id))
      .limit(1)
      .for("update");
    if (!reservation) return fail(reservationFailure("STAND_NOT_FOUND"));
    if (reservation.ownerUserId !== actor.id) {
      return fail(reservationFailure("UNAUTHORIZED"));
    }
    if (!statusAllowsRelease(reservation.status)) {
      return fail(reservationFailure("RELEASE_NOT_PENDING"));
    }

    // Every other reason self-service can be refused still applies here: a
    // sanctioned, unenrolled, terms-stale or closed-out owner must not be able
    // to spend credits or move a reservation. This gate was missing entirely,
    // so the two new commands were the only participant mutations in the
    // codebase that skipped it.
    //
    // `ALREADY_RESERVED` is the one exemption, for the reason
    // `createFeatureCreditTopUp` already spells out: you cannot release a
    // reservation you do not hold, so holding one is the precondition rather
    // than the disqualification.
    const denial = await denySelfServiceMutation(tx, {
      actor: { id: actor.id, role: actor.role },
      userId: actor.id,
      festivalId: preview.festivalId,
    });
    if (denial && denial.code !== "ALREADY_RESERVED") return fail(denial);

    const lockedParticipantIds = await readReservationParticipantIds(
      tx,
      reservation.id,
    );
    const memberStandIds = await activeReservationStandIds(tx, reservation.id);
    if (!sameIdSet(memberStandIds, previewStandIds)) {
      return fail(reservationFailure("CONFLICT_RETRY"));
    }

    // Refuse if anything has actually been paid, across every invoice this
    // release would cancel. Guessing at a refund is the one outcome this
    // command must never produce.
    //
    // Two separate bugs lived in what this replaces. It asked whether a
    // `payments` row existed at all — but a row is written when a proof is
    // *submitted*, and `payments` carries no status, so a proof that an admin
    // later rejected blocked release permanently. That is exactly the person
    // the feature exists for. It also inspected `invoiceRows[0]`, an
    // unordered pick, while the transaction cancels all of them.
    //
    // `getInvoiceTenderTotalsInTx` is the canonical answer: cash counts only
    // through an approved settlement submission, and credits only through
    // posted allocations.
    //
    // Credit allocations refuse too. That is a deliberate stop rather than a
    // solution: cancelling an invoice does not reverse an allocation, and no
    // reversal path exists anywhere in the codebase, so releasing would
    // destroy credits the owner had already applied while the dialog and the
    // email both say nothing was paid.
    for (const row of invoiceRows) {
      const tender = await getInvoiceTenderTotalsInTx(tx, row);
      if (tender.approvedCashAmount > 0 || tender.confirmedCreditAmount > 0) {
        return fail(reservationFailure("RELEASE_INVOICE_SETTLED"));
      }
    }

    const [action] = await tx
      .insert(reservationFeatureActions)
      .values({
        festivalId: preview.festivalId,
        reservationId: reservation.id,
        ownerUserId: actor.id,
        type: "reservation_release",
        status: "fulfilled",
        featureConfigId: config.id,
        featurePriceSnapshot: config.creditPrice,
        idempotencyKey: `reservation-release:${input.idempotencyKey}`,
        fulfilledAt: new Date(),
      })
      .returning({ id: reservationFeatureActions.id });
    if (!action) return fail(reservationFailure("CONFLICT_RETRY"));

    // Credits last, per the §14 lock order, and in this same transaction: a
    // debit that commits without the release would take money for nothing.
    const spend = await spendCreditsForFeatureInTx(tx, {
      userId: actor.id,
      featureActionId: action.id,
      amount: config.creditPrice,
      idempotencyKey: `reservation-release-spend:${input.idempotencyKey}`,
    });
    if (!spend.ok) {
      // Same reasoning as the late-partner path: `fail` returns so its
      // registry release can commit, which would commit this action too. A
      // `fulfilled` release with nothing released and nothing charged is
      // worse than no row at all, and its unique key would poison a retry.
      await tx
        .delete(reservationFeatureActions)
        .where(eq(reservationFeatureActions.id, action.id));
      return fail(
        reservationFailure(
          spend.code === "INSUFFICIENT_CREDITS"
            ? "RELEASE_INSUFFICIENT_CREDITS"
            : "CONFLICT_RETRY",
        ),
      );
    }

    await tx
      .update(standReservations)
      .set({ status: "released", revealAt: null, updatedAt: new Date() })
      .where(eq(standReservations.id, reservation.id));

    for (const standId of memberStandIds) {
      await releaseReservationMember(tx, {
        reservationId: reservation.id,
        standId,
      });
      await releaseStandIfVacant(tx, standId);
    }

    // Nothing is owed on a reservation that no longer exists, and the payment
    // reminder for it would otherwise still fire.
    await tx
      .update(invoices)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(invoices.reservationId, reservation.id),
          eq(invoices.status, "pending"),
        ),
      );
    await tx
      .delete(scheduledTasks)
      .where(eq(scheduledTasks.reservationId, reservation.id));

    await insertStandReservationEvent(tx, {
      reservationId: reservation.id,
      actorUserId: actor.id,
      eventType: "status_changed",
      fromStatus: "pending",
      toStatus: "released",
      payload: {
        action: "reservation_released",
        featureActionId: action.id,
        creditPrice: config.creditPrice,
        releasedStandIds: memberStandIds,
        participantUserIds: lockedParticipantIds,
      },
      idempotencyKey: `release:${input.idempotencyKey}`,
    });

    // Everyone on the reservation hears about it, not just the person who
    // pressed the button: a partner loses their space too, and finding that
    // out by opening the map is worse than being told.
    const recipients =
      lockedParticipantIds.length === 0
        ? []
        : await tx
            .select({ id: users.id, email: users.email })
            .from(users)
            .where(inArray(users.id, lockedParticipantIds));

    const jobIds: number[] = [];
    for (const recipient of recipients) {
      if (!recipient.email) continue;
      const jobId = await enqueueReservationNotification(tx, {
        kind: "reservation_released",
        reservationId: reservation.id,
        userId: recipient.id,
        recipientEmail: recipient.email,
        payload: { creditPrice: config.creditPrice },
      });
      if (jobId) jobIds.push(jobId);
    }

    await completeRequest(tx, input.idempotencyKey, {
      releasedStandIds: memberStandIds.join(","),
      featureActionId: action.id,
    });

    return reservationSuccess(
      { releasedStandIds: memberStandIds, jobIds },
      "Liberaste tu reserva. El espacio volvió al mapa y ya podés reservar otro.",
    );
  });
}
