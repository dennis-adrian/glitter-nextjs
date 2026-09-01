import "server-only";

import { fetchAdminUsers } from "@/app/api/users/actions";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import {
  reservationFailure,
  reservationSuccess,
  type ReservationActionResult,
} from "@/app/lib/reservations/errors";
import {
  lockFestivalRow,
  lockFestivalTermsDocument,
  lockHoldRows,
  lockParticipantEligibilityRows,
  lockParticipants,
  lockParticipantsBeforeRegistryClaim,
  lockReservationAggregate,
  lockStandRows,
  uniqueSortedIds,
} from "@/app/lib/reservations/locks";
import { releaseStandIfVacant } from "@/app/lib/reservations/occupancy";
import { assertReservationPartner } from "@/app/lib/reservations/partner-eligibility";
import { roundMoney } from "@/app/lib/reservations/money";
import {
  enqueueAdminAndOwnerNotifications,
  scheduleReservationNotificationJobs,
} from "@/app/lib/reservations/notification-outbox";
import {
  abandonRequest,
  claimRequest,
  completeRequest,
} from "@/app/lib/reservations/request-registry";
import {
  parseConfirmHoldInput,
  parseHoldIdInput,
  parseHoldStandInput,
  type ConfirmStandHoldInput,
} from "@/app/lib/reservations/schemas";
import {
  denyIfStandNotEligibleForProfile,
  denySelfServiceMutation,
} from "@/app/lib/reservations/tx-eligibility";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  festivals,
  invoices,
  reservationParticipants,
  scheduledTasks,
  standHolds,
  standReservations,
  stands,
} from "@/db/schema";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const HOLD_DURATION_MINUTES = 5;

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function guardedRevalidate() {
  try {
    revalidatePath("/profiles");
    revalidatePath("/my_profile");
  } catch (error) {
    console.error("[stand-hold] revalidatePath failed", error);
  }
}

async function requireSelfServiceActor() {
  const actor = await getCurrentUserProfile();
  if (!actor)
    return { actor: null, denial: reservationFailure("UNAUTHENTICATED") };
  return { actor, denial: null };
}

async function findLiveSelfServiceReservation(
  tx: DbTx,
  userId: number,
  festivalId?: number,
) {
  const conditions = [
    eq(reservationParticipants.userId, userId),
    sql`${standReservations.status} IN ('pending', 'verification_payment', 'accepted')`,
    sql`${standReservations.source} IN ('user_reservation', 'legacy_unknown')`,
  ];
  if (festivalId != null) {
    conditions.push(eq(standReservations.festivalId, festivalId));
  }

  const [row] = await tx
    .select({ id: standReservations.id })
    .from(reservationParticipants)
    .innerJoin(
      standReservations,
      eq(standReservations.id, reservationParticipants.reservationId),
    )
    .where(and(...conditions))
    .limit(1);

  return row ?? null;
}

async function replayLiveSelfServiceReservation(
  tx: DbTx,
  userId: number,
  festivalId?: number,
) {
  const existing = await findLiveSelfServiceReservation(tx, userId, festivalId);
  if (!existing) return null;
  return reservationSuccess(
    { reservationId: existing.id },
    "Ya tenés una reserva vigente en este festival.",
  );
}

export async function fetchHoldWithStand(
  holdId: number,
  userId: number,
  festivalId: number,
) {
  return db.query.standHolds.findFirst({
    where: and(
      eq(standHolds.id, holdId),
      eq(standHolds.userId, userId),
      eq(standHolds.festivalId, festivalId),
    ),
    with: { stand: true },
  });
}

export async function getActiveHold(
  userId: number,
  festivalId: number,
): Promise<{ id: number; standId: number } | null> {
  const hold = await db.query.standHolds.findFirst({
    where: and(
      eq(standHolds.userId, userId),
      eq(standHolds.festivalId, festivalId),
      gt(standHolds.expiresAt, new Date()),
    ),
    columns: { id: true, standId: true },
  });
  return hold ? { id: hold.id, standId: hold.standId } : null;
}

async function reconcileExpiredHolds(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { standId: number; userId: number; festivalId: number; now: Date },
) {
  const expired = await tx
    .select({ id: standHolds.id, standId: standHolds.standId })
    .from(standHolds)
    .where(
      and(
        lte(standHolds.expiresAt, input.now),
        sql`(${standHolds.standId} = ${input.standId} OR (${standHolds.userId} = ${input.userId} AND ${standHolds.festivalId} = ${input.festivalId}))`,
      ),
    );

  for (const hold of expired) {
    await tx.delete(standHolds).where(eq(standHolds.id, hold.id));
    const [liveHold] = await tx
      .select({ id: standHolds.id })
      .from(standHolds)
      .where(
        and(
          eq(standHolds.standId, hold.standId),
          gt(standHolds.expiresAt, input.now),
        ),
      )
      .limit(1);
    const [liveReservation] = await tx
      .select({ id: standReservations.id })
      .from(standReservations)
      .where(
        and(
          eq(standReservations.standId, hold.standId),
          sql`${standReservations.status} IN ('pending', 'verification_payment', 'accepted')`,
        ),
      )
      .limit(1);
    if (!liveHold && !liveReservation) {
      await releaseStandIfVacant(tx, hold.standId, input.now);
    }
  }
}

export async function createStandHold(standIdInput: unknown): Promise<
  ReservationActionResult<{
    holdId?: number;
    alreadyHeld?: boolean;
    reservationId?: number;
  }>
> {
  const parsed = parseHoldStandInput(standIdInput);
  if (!parsed.success) return reservationFailure("VALIDATION");

  const { actor, denial } = await requireSelfServiceActor();
  if (!actor || denial) return denial!;

  const standId = parsed.data.standId;
  const idempotencyKey = parsed.data.idempotencyKey;
  const now = new Date();

  try {
    const result = await db.transaction(async (tx) => {
      const [standPreview] = await tx
        .select({ festivalId: stands.festivalId })
        .from(stands)
        .where(eq(stands.id, standId))
        .limit(1);
      if (standPreview?.festivalId != null) {
        await lockParticipantsBeforeRegistryClaim(tx, standPreview.festivalId, [
          actor.id,
        ]);
      }

      const claim = await claimRequest(tx, {
        requestKey: idempotencyKey,
        operation: "createOrReplaceStandHold",
        actorUserId: actor.id,
        scope: { standId },
      });
      if (claim.kind === "conflict") {
        return reservationFailure("CONFLICT_RETRY");
      }
      if (claim.kind === "replayed") {
        const holdId = claim.resultIds.holdId;
        const reservationId = claim.resultIds.reservationId;
        if (typeof reservationId === "number") {
          return reservationSuccess(
            { reservationId },
            "Ya tenés una reserva vigente en este festival.",
          );
        }
        if (typeof holdId !== "number") {
          return reservationFailure("CONFLICT_RETRY");
        }
        return reservationSuccess(
          { holdId, alreadyHeld: true },
          "Ya tenés este espacio en espera",
        );
      }

      const finish = async (
        outcome:
          | ReturnType<
              typeof reservationSuccess<{
                holdId?: number;
                alreadyHeld?: boolean;
                reservationId?: number;
              }>
            >
          | ReturnType<typeof reservationFailure>,
        resultIds?: { holdId?: number; reservationId?: number },
      ) => {
        if (outcome.success) {
          await completeRequest(tx, idempotencyKey, resultIds ?? {});
        } else {
          await abandonRequest(tx, idempotencyKey);
        }
        return outcome;
      };

      const [stand] = await tx
        .select({
          id: stands.id,
          status: stands.status,
          festivalId: stands.festivalId,
          standCategory: stands.standCategory,
          participationType: stands.participationType,
          price: stands.price,
        })
        .from(stands)
        .where(eq(stands.id, standId))
        .limit(1);

      if (!stand) return finish(reservationFailure("STAND_NOT_FOUND"));
      if (stand.festivalId == null) {
        return finish(reservationFailure("STAND_WRONG_FESTIVAL"));
      }

      const existingHoldPreview = await tx
        .select({
          id: standHolds.id,
          standId: standHolds.standId,
        })
        .from(standHolds)
        .where(
          and(
            eq(standHolds.userId, actor.id),
            eq(standHolds.festivalId, stand.festivalId),
            gt(standHolds.expiresAt, now),
          ),
        );

      const standIdsToLock = uniqueSortedIds([
        stand.id,
        ...existingHoldPreview.map((hold) => hold.standId),
      ]);

      await lockParticipants(tx, stand.festivalId, [actor.id]);
      await lockFestivalRow(tx, stand.festivalId);
      await lockFestivalTermsDocument(tx);
      await lockParticipantEligibilityRows(tx, stand.festivalId, [actor.id]);
      await lockStandRows(tx, standIdsToLock);
      await lockHoldRows(
        tx,
        existingHoldPreview.map((hold) => hold.id),
      );

      await reconcileExpiredHolds(tx, {
        standId: stand.id,
        userId: actor.id,
        festivalId: stand.festivalId,
        now,
      });

      const [freshStand] = await tx
        .select({
          id: stands.id,
          status: stands.status,
          festivalId: stands.festivalId,
          standCategory: stands.standCategory,
          participationType: stands.participationType,
          price: stands.price,
        })
        .from(stands)
        .where(eq(stands.id, standId))
        .limit(1)
        .for("update");
      if (!freshStand) return finish(reservationFailure("STAND_NOT_FOUND"));
      if (freshStand.festivalId == null) {
        return finish(reservationFailure("STAND_WRONG_FESTIVAL"));
      }

      const blocked = await denySelfServiceMutation(tx, {
        actor: { id: actor.id, role: actor.role },
        userId: actor.id,
        festivalId: freshStand.festivalId,
        now,
      });
      if (blocked) {
        if (blocked.code === "ALREADY_RESERVED") {
          const replayed = await replayLiveSelfServiceReservation(
            tx,
            actor.id,
            freshStand.festivalId,
          );
          if (replayed) {
            return finish(replayed, {
              reservationId: replayed.data.reservationId,
            });
          }
        }
        return finish(blocked);
      }

      const ineligibleStand = await denyIfStandNotEligibleForProfile(tx, {
        standId: freshStand.id,
        standCategory: freshStand.standCategory,
        participationType: freshStand.participationType,
        userId: actor.id,
      });
      if (ineligibleStand) return finish(ineligibleStand);

      const existingHold = await tx
        .select({ id: standHolds.id, standId: standHolds.standId })
        .from(standHolds)
        .where(
          and(
            eq(standHolds.userId, actor.id),
            eq(standHolds.festivalId, freshStand.festivalId),
            gt(standHolds.expiresAt, now),
          ),
        )
        .limit(1);

      if (existingHold.length > 0 && existingHold[0].standId === standId) {
        return finish(
          reservationSuccess(
            { holdId: existingHold[0].id, alreadyHeld: true },
            "Ya tenés este espacio en espera",
          ),
          { holdId: existingHold[0].id },
        );
      }

      if (existingHold.length > 0) {
        const oldStandId = existingHold[0].standId;
        if (freshStand.status !== "available") {
          return finish(reservationFailure("STAND_UNAVAILABLE"));
        }

        await tx
          .delete(standHolds)
          .where(eq(standHolds.id, existingHold[0].id));
        await releaseStandIfVacant(tx, oldStandId, now);
      }

      const [currentStand] = await tx
        .select({ status: stands.status })
        .from(stands)
        .where(eq(stands.id, standId))
        .limit(1)
        .for("update");
      if (!currentStand || currentStand.status !== "available") {
        return finish(reservationFailure("STAND_UNAVAILABLE"));
      }

      const [festivalHold] = await tx
        .select({
          reservationHoldMinutes: festivals.reservationHoldMinutes,
        })
        .from(festivals)
        .where(eq(festivals.id, freshStand.festivalId))
        .limit(1);
      const holdMinutes =
        festivalHold?.reservationHoldMinutes ?? HOLD_DURATION_MINUTES;
      const expiresAt = new Date(now.getTime() + holdMinutes * 60 * 1000);
      const [hold] = await tx
        .insert(standHolds)
        .values({
          standId: freshStand.id,
          userId: actor.id,
          festivalId: freshStand.festivalId,
          expiresAt,
          priceAmountSnapshot: roundMoney(freshStand.price ?? 0),
          individualPriceSnapshot: roundMoney(freshStand.price ?? 0),
          idempotencyKey,
        })
        .returning();

      await tx
        .update(stands)
        .set({ status: "held", updatedAt: now })
        .where(eq(stands.id, standId));

      return finish(
        reservationSuccess(
          { holdId: hold.id },
          "Espacio reservado temporalmente",
        ),
        { holdId: hold.id },
      );
    });

    guardedRevalidate();
    return result;
  } catch (error) {
    console.error("Error creating stand hold", error);
    return reservationFailure("CONFLICT_RETRY");
  }
}

export async function cancelStandHold(
  holdIdInput: unknown,
): Promise<ReservationActionResult> {
  const parsed = parseHoldIdInput(holdIdInput);
  if (!parsed.success) return reservationFailure("VALIDATION");

  const { actor, denial } = await requireSelfServiceActor();
  if (!actor || denial) return denial!;

  try {
    const outcome = await db.transaction(async (tx) => {
      const [preview] = await tx
        .select({
          id: standHolds.id,
          standId: standHolds.standId,
          festivalId: standHolds.festivalId,
          userId: standHolds.userId,
        })
        .from(standHolds)
        .where(eq(standHolds.id, parsed.data.holdId))
        .limit(1);

      if (!preview) {
        return reservationSuccess(undefined, "Reserva temporal cancelada");
      }
      if (preview.userId !== actor.id) {
        return reservationFailure("HOLD_NOT_OWNED");
      }

      const locked = await lockReservationAggregate(tx, {
        festivalId: preview.festivalId,
        userIds: [actor.id],
        standIds: [preview.standId],
        holdIds: [preview.id],
      });
      if (!locked.ok) return reservationFailure("CONFLICT_RETRY");

      const [hold] = await tx
        .select({
          id: standHolds.id,
          standId: standHolds.standId,
          festivalId: standHolds.festivalId,
          userId: standHolds.userId,
        })
        .from(standHolds)
        .where(eq(standHolds.id, preview.id))
        .limit(1)
        .for("update");

      if (!hold) {
        return reservationSuccess(undefined, "Reserva temporal cancelada");
      }
      if (hold.userId !== actor.id) {
        return reservationFailure("HOLD_NOT_OWNED");
      }
      if (
        hold.standId !== preview.standId ||
        hold.festivalId !== preview.festivalId
      ) {
        return reservationFailure("CONFLICT_RETRY");
      }

      await tx.delete(standHolds).where(eq(standHolds.id, hold.id));
      await releaseStandIfVacant(tx, hold.standId);
      return reservationSuccess(undefined, "Reserva temporal cancelada");
    });

    guardedRevalidate();
    return outcome;
  } catch (error) {
    console.error("Error cancelling stand hold", error);
    return reservationFailure("CONFLICT_RETRY");
  }
}

export async function confirmStandHold(
  input: ConfirmStandHoldInput,
): Promise<ReservationActionResult<{ reservationId: number }>> {
  const parsed = parseConfirmHoldInput(input);
  if (!parsed.success) return reservationFailure("VALIDATION");
  const { holdId, partnerId, idempotencyKey } = parsed.data;
  const normalizedPartnerId = partnerId ?? null;

  const { actor, denial } = await requireSelfServiceActor();
  if (!actor || denial) return denial!;

  try {
    const admins = await fetchAdminUsers();
    const result = await db.transaction(async (tx) => {
      const [holdPreviewForLock] = await tx
        .select({ festivalId: standHolds.festivalId })
        .from(standHolds)
        .where(eq(standHolds.id, holdId))
        .limit(1);
      if (holdPreviewForLock?.festivalId != null) {
        await lockParticipantsBeforeRegistryClaim(
          tx,
          holdPreviewForLock.festivalId,
          normalizedPartnerId != null
            ? [actor.id, normalizedPartnerId]
            : [actor.id],
        );
      }

      const claim = await claimRequest(tx, {
        requestKey: idempotencyKey,
        operation: "confirmStandHold",
        actorUserId: actor.id,
        scope: { holdId, partnerId: normalizedPartnerId },
      });
      if (claim.kind === "conflict") {
        return reservationFailure("CONFLICT_RETRY");
      }
      if (claim.kind === "replayed") {
        const reservationId = claim.resultIds.reservationId;
        if (typeof reservationId !== "number") {
          return reservationFailure("CONFLICT_RETRY");
        }
        return reservationSuccess(
          { reservationId },
          "Ya tenés una reserva vigente en este festival.",
        );
      }

      const finish = async (
        outcome:
          | ReturnType<typeof reservationSuccess<{ reservationId: number }>>
          | ReturnType<typeof reservationFailure>
          | {
              success: true;
              reservationId: number;
              jobIds: number[];
              message: string;
            },
        resultIds?: { reservationId: number },
      ) => {
        if ("success" in outcome && outcome.success === false) {
          await abandonRequest(tx, idempotencyKey);
          return outcome;
        }
        const reservationId =
          resultIds?.reservationId ??
          ("reservationId" in outcome ? outcome.reservationId : undefined) ??
          ("data" in outcome && outcome.data
            ? outcome.data.reservationId
            : undefined);
        if (typeof reservationId === "number") {
          await completeRequest(tx, idempotencyKey, { reservationId });
        } else {
          await abandonRequest(tx, idempotencyKey);
        }
        return outcome;
      };

      const holdSelect = {
        id: standHolds.id,
        standId: standHolds.standId,
        festivalId: standHolds.festivalId,
        userId: standHolds.userId,
        priceAmountSnapshot: standHolds.priceAmountSnapshot,
        individualPriceSnapshot: standHolds.individualPriceSnapshot,
        sharedPriceSnapshot: standHolds.sharedPriceSnapshot,
        standFestivalId: stands.festivalId,
        standPrice: stands.price,
        standStatus: stands.status,
        standCategory: stands.standCategory,
        participationType: stands.participationType,
      } as const;

      const holdWhere = and(
        eq(standHolds.id, holdId),
        eq(standHolds.userId, actor.id),
        gt(standHolds.expiresAt, new Date()),
      );

      const [holdPreview] = await tx
        .select(holdSelect)
        .from(standHolds)
        .innerJoin(stands, eq(stands.id, standHolds.standId))
        .where(holdWhere)
        .limit(1);

      if (!holdPreview) {
        const [ownedHold] = await tx
          .select({ festivalId: standHolds.festivalId })
          .from(standHolds)
          .where(
            and(eq(standHolds.id, holdId), eq(standHolds.userId, actor.id)),
          )
          .limit(1);
        if (ownedHold?.festivalId == null) {
          return finish(reservationFailure("HOLD_EXPIRED"));
        }
        const replayed = await replayLiveSelfServiceReservation(
          tx,
          actor.id,
          ownedHold.festivalId,
        );
        if (replayed) {
          return finish(replayed, {
            reservationId: replayed.data.reservationId,
          });
        }
        return finish(reservationFailure("HOLD_EXPIRED"));
      }
      if (holdPreview.festivalId !== holdPreview.standFestivalId) {
        return finish(reservationFailure("STAND_WRONG_FESTIVAL"));
      }
      if (holdPreview.standStatus !== "held") {
        return finish(reservationFailure("STAND_UNAVAILABLE"));
      }

      const participantIds = partnerId ? [actor.id, partnerId] : [actor.id];
      const locked = await lockReservationAggregate(tx, {
        festivalId: holdPreview.festivalId,
        userIds: participantIds,
        standIds: [holdPreview.standId],
        holdIds: [holdPreview.id],
      });
      if (!locked.ok) return finish(reservationFailure("CONFLICT_RETRY"));

      const lockedHoldWhere = and(
        eq(standHolds.id, holdId),
        eq(standHolds.userId, actor.id),
        gt(standHolds.expiresAt, new Date()),
      );

      const [hold] = await tx
        .select(holdSelect)
        .from(standHolds)
        .innerJoin(stands, eq(stands.id, standHolds.standId))
        .where(lockedHoldWhere)
        .limit(1)
        .for("update");

      if (!hold) {
        const replayed = await replayLiveSelfServiceReservation(
          tx,
          actor.id,
          holdPreview.festivalId,
        );
        if (replayed) {
          return finish(replayed, {
            reservationId: replayed.data.reservationId,
          });
        }
        return finish(reservationFailure("HOLD_EXPIRED"));
      }
      if (hold.festivalId !== hold.standFestivalId) {
        return finish(reservationFailure("STAND_WRONG_FESTIVAL"));
      }
      if (hold.standStatus !== "held") {
        return finish(reservationFailure("STAND_UNAVAILABLE"));
      }

      if (partnerId) {
        if (partnerId === actor.id) {
          return finish(reservationFailure("PARTNER_NOT_ELIGIBLE"));
        }
        const partnerBlocked = await assertReservationPartner(tx, {
          festivalId: hold.festivalId,
          ownerUserId: actor.id,
          partnerUserId: partnerId,
          standCategory: hold.standCategory,
          existingParticipantUserIds: [actor.id],
          mode: "self_service",
          actor: { id: actor.id, role: actor.role },
        });
        if (partnerBlocked) return finish(partnerBlocked);
      }

      const ownerBlocked = await denySelfServiceMutation(tx, {
        actor: { id: actor.id, role: actor.role },
        userId: actor.id,
        festivalId: hold.festivalId,
      });
      if (ownerBlocked) {
        if (ownerBlocked.code === "ALREADY_RESERVED") {
          const replayed = await replayLiveSelfServiceReservation(
            tx,
            actor.id,
            hold.festivalId,
          );
          if (replayed) {
            return finish(replayed, {
              reservationId: replayed.data.reservationId,
            });
          }
        }
        return finish(ownerBlocked);
      }

      const ineligibleStand = await denyIfStandNotEligibleForProfile(tx, {
        standId: hold.standId,
        standCategory: hold.standCategory,
        participationType: hold.participationType,
        userId: actor.id,
      });
      if (ineligibleStand) return finish(ineligibleStand);

      const standPrice = roundMoney(
        hold.priceAmountSnapshot ?? hold.standPrice ?? 0,
      );

      const [reservation] = await tx
        .insert(standReservations)
        .values({
          festivalId: hold.festivalId,
          standId: hold.standId,
          source: "user_reservation",
          ownerUserId: actor.id,
          priceAmountSnapshot: roundMoney(standPrice),
          individualPriceSnapshot: roundMoney(
            hold.individualPriceSnapshot ?? standPrice,
          ),
          sharedPriceSnapshot: hold.sharedPriceSnapshot,
          bookedParticipantCount: participantIds.length,
          idempotencyKey,
        })
        .returning();

      await tx.insert(reservationParticipants).values(
        participantIds.map((uid) => ({
          userId: uid,
          reservationId: reservation.id,
        })),
      );

      await insertStandReservationEvent(tx, {
        reservationId: reservation.id,
        actorUserId: actor.id,
        eventType: "created",
        toStatus: "pending",
        payload: { standId: hold.standId, partnerId: partnerId ?? null },
      });

      const updatedStands = await tx
        .update(stands)
        .set({ status: "reserved", updatedAt: new Date() })
        .where(and(eq(stands.id, hold.standId), eq(stands.status, "held")))
        .returning({ id: stands.id });
      if (updatedStands.length === 0) {
        throw new Error("stand_status_conflict");
      }

      await tx.insert(invoices).values({
        date: new Date(),
        dueAt: sql`now() + interval '5 days'`,
        userId: actor.id,
        reservationId: reservation.id,
        originalAmount: standPrice,
        amount: standPrice,
      });

      await tx.insert(scheduledTasks).values({
        dueDate: sql`now() + interval '5 days'`,
        reminderTime: sql`now() + interval '4 days'`,
        profileId: actor.id,
        reservationId: reservation.id,
        taskType: "stand_reservation",
      });

      await tx.delete(standHolds).where(eq(standHolds.id, hold.id));

      const jobIds = await enqueueAdminAndOwnerNotifications(tx, {
        kind: "reservation_created",
        reservationId: reservation.id,
        ownerUserId: actor.id,
        ownerEmail: null,
        adminEmails: admins.map((admin) => ({
          id: admin.id,
          email: admin.email,
        })),
      });

      return finish(
        {
          success: true as const,
          reservationId: reservation.id,
          jobIds,
          message: "Reserva creada",
        },
        { reservationId: reservation.id },
      );
    });

    if (!result.success) {
      guardedRevalidate();
      return result;
    }

    const payload = result as {
      data?: { reservationId: number; jobIds?: number[] };
      reservationId?: number;
      jobIds?: number[];
      message: string;
    };
    const reservationId = payload.reservationId ?? payload.data?.reservationId;
    if (reservationId == null) {
      guardedRevalidate();
      return reservationFailure("CONFLICT_RETRY");
    }
    scheduleReservationNotificationJobs(
      payload.jobIds ?? payload.data?.jobIds ?? [],
    );
    guardedRevalidate();
    return reservationSuccess({ reservationId }, payload.message);
  } catch (error) {
    console.error("Error confirming stand hold", error);
    return reservationFailure("CONFLICT_RETRY");
  }
}

export async function cleanupExpiredHolds(): Promise<{ expired: number }> {
  try {
    const now = new Date();
    const expiredHolds = await db
      .select({ id: standHolds.id, standId: standHolds.standId })
      .from(standHolds)
      .where(lte(standHolds.expiresAt, now));

    if (expiredHolds.length === 0) return { expired: 0 };

    await db.transaction(async (tx) => {
      const standIds = [
        ...new Set(expiredHolds.map((hold) => hold.standId)),
      ].sort((a, b) => a - b);
      for (const standId of standIds) {
        await tx
          .select({ id: stands.id })
          .from(stands)
          .where(eq(stands.id, standId))
          .limit(1)
          .for("update");
      }

      for (const hold of expiredHolds) {
        await tx.delete(standHolds).where(eq(standHolds.id, hold.id));
        const [liveHold] = await tx
          .select({ id: standHolds.id })
          .from(standHolds)
          .where(
            and(
              eq(standHolds.standId, hold.standId),
              gt(standHolds.expiresAt, now),
            ),
          )
          .limit(1);
        const [liveReservation] = await tx
          .select({ id: standReservations.id })
          .from(standReservations)
          .where(
            and(
              eq(standReservations.standId, hold.standId),
              sql`${standReservations.status} IN ('pending', 'verification_payment', 'accepted')`,
            ),
          )
          .limit(1);
        if (!liveHold && !liveReservation) {
          await releaseStandIfVacant(tx, hold.standId, now);
        }
      }
    });

    return { expired: expiredHolds.length };
  } catch (error) {
    console.error("Error cleaning up expired holds", error);
    return { expired: 0 };
  }
}
