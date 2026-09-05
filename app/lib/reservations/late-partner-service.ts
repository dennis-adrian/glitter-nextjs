import "server-only";

import { eq, inArray } from "drizzle-orm";

import { spendCreditsForFeatureInTx } from "@/app/lib/credits/service";
import { fetchFeatureConfig } from "@/app/lib/festivals/feature-config-service";
import {
  type ReservationActionResult,
  reservationFailure,
  reservationSuccess,
} from "@/app/lib/reservations/errors";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import { latePartnerBlockReason } from "@/app/lib/reservations/late-partner-availability";
import { latePartnerPrice } from "@/app/lib/reservations/late-partner-pricing";
import {
  lockParticipantsBeforeRegistryClaim,
  lockReservationAggregate,
  readReservationParticipantIds,
  uniqueSortedIds,
} from "@/app/lib/reservations/locks";
import { enqueueReservationNotification } from "@/app/lib/reservations/notification-queue";
import { assertReservationPartner } from "@/app/lib/reservations/partner-eligibility";
import {
  abandonRequest,
  claimRequest,
  completeRequest,
} from "@/app/lib/reservations/request-registry";
import { denySelfServiceMutation } from "@/app/lib/reservations/tx-eligibility";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  reservationFeatureActionItems,
  reservationFeatureActions,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";

/**
 * Adds one illustration partner to a reservation already made (PRD §8).
 *
 * The owner forgot to bring somebody in at booking, or found them afterwards.
 * They pay two things in credits, in one debit: the difference between what
 * one person costs and what two cost, and the festival's fee for doing this
 * late.
 *
 * The original invoice is never touched (§8.4). That is the deliberate
 * difference from the admin partner flow, which reprices it — here the
 * reservation was quoted and possibly already paid at the individual price,
 * and rewriting a settled invoice to collect a difference is not something a
 * participant action may do.
 *
 * Immediate and final: there is no partner claim to expire and no review to
 * wait for. A race can only happen between choosing somebody and confirming,
 * and that is resolved by revalidating everything under the locks.
 */
export async function addLatePartner(input: {
  reservationId: number;
  partnerUserId: number;
  idempotencyKey: string;
}): Promise<
  ReservationActionResult<{ featureActionId: number; jobIds: number[] }>
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
        standId: standReservations.standId,
        individualPriceSnapshot: standReservations.individualPriceSnapshot,
        sharedPriceSnapshot: standReservations.sharedPriceSnapshot,
      })
      .from(standReservations)
      .where(eq(standReservations.id, input.reservationId))
      .limit(1);
    if (!preview) return reservationFailure("STAND_NOT_FOUND");
    if (preview.ownerUserId !== actor.id) {
      return reservationFailure("UNAUTHORIZED");
    }
    if (input.partnerUserId === actor.id) {
      return reservationFailure("PARTNER_NOT_ELIGIBLE");
    }

    const previewUserIds = uniqueSortedIds([
      ...(await readReservationParticipantIds(tx, preview.id)),
      actor.id,
      input.partnerUserId,
    ]);
    await lockParticipantsBeforeRegistryClaim(
      tx,
      preview.festivalId,
      previewUserIds,
    );

    // Claimed before validation so a retry replays rather than failing on a
    // reservation that now has two participants — its own success.
    const claim = await claimRequest(tx, {
      requestKey: input.idempotencyKey,
      operation: "addLatePartner",
      actorUserId: actor.id,
      scope: {
        reservationId: input.reservationId,
        partnerUserId: input.partnerUserId,
      },
    });
    if (claim.kind === "conflict") return reservationFailure("CONFLICT_RETRY");
    if (claim.kind === "replayed") {
      const featureActionId = claim.resultIds.featureActionId;
      if (typeof featureActionId !== "number") {
        return reservationFailure("CONFLICT_RETRY");
      }
      return reservationSuccess(
        { featureActionId, jobIds: [] },
        "Tu compañero ya fue agregado.",
      );
    }

    const fail = async (result: ReturnType<typeof reservationFailure>) => {
      await abandonRequest(tx, input.idempotencyKey);
      return result;
    };

    const [stand] = await tx
      .select({ standCategory: stands.standCategory })
      .from(stands)
      .where(eq(stands.id, preview.standId))
      .limit(1);
    if (!stand) return fail(reservationFailure("STAND_NOT_FOUND"));

    // Read on this transaction's connection: reaching for the pool while
    // holding participant locks checks out a second connection that only a
    // finishing transaction can free.
    const config = await fetchFeatureConfig(
      preview.festivalId,
      "late_partner",
      null,
      new Date(),
      tx,
    );
    if (!config || !config.enabled) {
      return fail(reservationFailure("LATE_PARTNER_UNAVAILABLE"));
    }
    // `resolveFeatureConfig` already refuses a late-partner config whose
    // deadline has gone, so that case arrives here rather than at the block
    // check below. Tell the two apart on the deadline itself rather than on
    // the reason string: "ya pasó la fecha" and "no está disponible" send a
    // participant to different places.
    if (!config.available) {
      const deadlineGone =
        config.effectiveDeadlineAt == null ||
        config.effectiveDeadlineAt.getTime() <= Date.now();
      return fail(
        reservationFailure(
          deadlineGone
            ? "LATE_PARTNER_DEADLINE_PASSED"
            : "LATE_PARTNER_UNAVAILABLE",
        ),
      );
    }

    const locked = await lockReservationAggregate(tx, {
      festivalId: preview.festivalId,
      userIds: previewUserIds,
      standIds: [preview.standId],
      reservationIds: [preview.id],
    });
    if (!locked.ok) return fail(reservationFailure("CONFLICT_RETRY"));

    // Everything below is re-read under the locks. The participant count is
    // the one that matters most: two owners racing to add partners to the same
    // reservation, or the same owner in two tabs, must produce one partner.
    const [reservation] = await tx
      .select({
        id: standReservations.id,
        status: standReservations.status,
        ownerUserId: standReservations.ownerUserId,
        individualPriceSnapshot: standReservations.individualPriceSnapshot,
        sharedPriceSnapshot: standReservations.sharedPriceSnapshot,
      })
      .from(standReservations)
      .where(eq(standReservations.id, preview.id))
      .limit(1)
      .for("update");
    if (!reservation) return fail(reservationFailure("STAND_NOT_FOUND"));
    if (reservation.ownerUserId !== actor.id) {
      return fail(reservationFailure("UNAUTHORIZED"));
    }

    // Every other reason self-service can be refused still applies here: a
    // sanctioned, unenrolled, terms-stale or closed-out owner must not be able
    // to spend credits or move a reservation. This gate was missing entirely,
    // so the two new commands were the only participant mutations in the
    // codebase that skipped it.
    //
    // `ALREADY_RESERVED` is the one exemption, for the reason
    // `createFeatureCreditTopUp` already spells out: you cannot share a
    // reservation you do not hold, so holding one is the precondition rather
    // than the disqualification.
    const denial = await denySelfServiceMutation(tx, {
      actor: { id: actor.id, role: actor.role },
      userId: actor.id,
      festivalId: preview.festivalId,
    });
    if (denial && denial.code !== "ALREADY_RESERVED") return fail(denial);

    const participantIds = await readReservationParticipantIds(tx, preview.id);
    const blocked = latePartnerBlockReason({
      isOwner: true,
      standCategory: stand.standCategory,
      reservationStatus: reservation.status,
      registeredParticipantCount: participantIds.length,
      effectiveDeadlineAt: config.effectiveDeadlineAt,
      now: new Date(),
    });
    if (blocked) {
      return fail(
        reservationFailure(
          blocked === "deadline_passed" || blocked === "no_deadline"
            ? "LATE_PARTNER_DEADLINE_PASSED"
            : blocked === "already_shared"
              ? "LATE_PARTNER_ALREADY_SHARED"
              : "LATE_PARTNER_UNAVAILABLE",
        ),
      );
    }

    // The canonical partner rules, unchanged. Adding somebody late changes the
    // timing, never who is allowed to be a partner (§8.2).
    const partnerFailure = await assertReservationPartner(tx, {
      festivalId: preview.festivalId,
      ownerUserId: actor.id,
      partnerUserId: input.partnerUserId,
      standCategory: stand.standCategory,
      existingParticipantUserIds: participantIds,
      reservationId: preview.id,
      mode: "self_service",
      actor: { id: actor.id, role: actor.role },
    });
    if (partnerFailure) return fail(partnerFailure);

    const price = latePartnerPrice({
      individualPriceSnapshot: reservation.individualPriceSnapshot,
      sharedPriceSnapshot: reservation.sharedPriceSnapshot,
      featurePrice: config.creditPrice,
    });
    // No shared price was agreed when this was booked, so there is no figure
    // for what two people cost and nothing honest to charge.
    if (!price) return fail(reservationFailure("LATE_PARTNER_NOT_PRICEABLE"));

    const [action] = await tx
      .insert(reservationFeatureActions)
      .values({
        festivalId: preview.festivalId,
        reservationId: preview.id,
        ownerUserId: actor.id,
        type: "late_partner",
        status: "fulfilled",
        featureConfigId: config.id,
        featurePriceSnapshot: price.featurePrice,
        targetPartnerUserId: input.partnerUserId,
        individualPriceSnapshot: reservation.individualPriceSnapshot,
        sharedPriceSnapshot: reservation.sharedPriceSnapshot,
        idempotencyKey: `late-partner:${input.idempotencyKey}`,
        fulfilledAt: new Date(),
      })
      .returning({ id: reservationFeatureActions.id });
    if (!action) return fail(reservationFailure("CONFLICT_RETRY"));

    // Both components recorded separately even though one debit covers them,
    // so reporting can tell a price adjustment from a fee (§6.2).
    await tx.insert(reservationFeatureActionItems).values([
      {
        featureActionId: action.id,
        kind: "shared_price_difference" as const,
        amount: price.sharedPriceDifference,
        descriptionSnapshot: "Diferencia entre precio individual y compartido",
      },
      {
        featureActionId: action.id,
        kind: "feature_access" as const,
        amount: price.featurePrice,
        descriptionSnapshot: "Agregar compañero después de reservar",
      },
    ]);

    // Credits last, per the §14 lock order, and inside this transaction: a
    // debit that commits without the partner would take money for nothing.
    const spend = await spendCreditsForFeatureInTx(tx, {
      userId: actor.id,
      featureActionId: action.id,
      amount: price.totalCredits,
      idempotencyKey: `late-partner-spend:${input.idempotencyKey}`,
    });
    if (!spend.ok) {
      // A refusal returns rather than throws, so `fail` can commit its
      // registry release — which means the rows above are committed too
      // unless they go now. Left behind, they are a `fulfilled` late-partner
      // action with no partner, no debit, and two accounting items nobody
      // paid, and its unique key would poison a retry of the same request.
      //
      // Deleted rather than reordered: the spend locks this action and the
      // ledger entry points at it, so it cannot run before the insert. The
      // items go with it through their cascade.
      await tx
        .delete(reservationFeatureActions)
        .where(eq(reservationFeatureActions.id, action.id));
      return fail(
        reservationFailure(
          spend.code === "INSUFFICIENT_CREDITS"
            ? "LATE_PARTNER_INSUFFICIENT_CREDITS"
            : "CONFLICT_RETRY",
        ),
      );
    }

    await tx
      .insert(reservationParticipants)
      .values({ reservationId: preview.id, userId: input.partnerUserId });

    // The reservation now holds two people. The invoice keeps its original
    // amount on purpose — the difference was just paid in credits.
    await tx
      .update(standReservations)
      .set({ bookedParticipantCount: 2, updatedAt: new Date() })
      .where(eq(standReservations.id, preview.id));

    await insertStandReservationEvent(tx, {
      reservationId: preview.id,
      actorUserId: actor.id,
      eventType: "status_changed",
      fromStatus: reservation.status,
      toStatus: reservation.status,
      payload: {
        action: "late_partner_added",
        featureActionId: action.id,
        partnerUserId: input.partnerUserId,
        sharedPriceDifference: price.sharedPriceDifference,
        featurePrice: price.featurePrice,
        totalCredits: price.totalCredits,
      },
      idempotencyKey: `late-partner:${input.idempotencyKey}`,
    });

    // The added partner hears about it, and so does the owner who paid.
    const recipients = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        inArray(users.id, uniqueSortedIds([actor.id, input.partnerUserId])),
      );

    const jobIds: number[] = [];
    for (const recipient of recipients) {
      if (!recipient.email) continue;
      const jobId = await enqueueReservationNotification(tx, {
        kind: "late_partner_added",
        reservationId: preview.id,
        userId: recipient.id,
        recipientEmail: recipient.email,
        // Keyed on the action, not just the reservation: the default
        // `kind:reservationId:email` key collides when a reservation gains a
        // partner twice (one added, removed by an admin, another added), and
        // the second notification is dropped as a duplicate.
        deduplicationKey: `late_partner_added:${action.id}:${recipient.id}`,
        payload: {
          partnerUserId: input.partnerUserId,
          totalCredits: price.totalCredits,
          sharedPriceDifference: price.sharedPriceDifference,
          featurePrice: price.featurePrice,
        },
      });
      if (jobId) jobIds.push(jobId);
    }

    await completeRequest(tx, input.idempotencyKey, {
      featureActionId: action.id,
      partnerUserId: input.partnerUserId,
    });

    return reservationSuccess(
      { featureActionId: action.id, jobIds },
      "Agregamos a tu compañero a la reserva.",
    );
  });
}
