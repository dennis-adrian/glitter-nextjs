import "server-only";

import { fetchAdminUsers } from "@/app/api/users/actions";
import {
  captureCreditHoldForFeatureInTx,
  releaseCreditHoldForFeatureInTx,
} from "@/app/lib/credits/service";
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
import {
  availableStandIds,
  findActiveFullTableAccess,
  isFullTableCategory,
  resolveFullTableCompanion,
} from "@/app/lib/reservations/full-table-access";
import {
  holdMemberStandIds,
  insertHoldMembers,
  insertReservationMembers,
} from "@/app/lib/reservations/members";
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
  reservationFeatureActions,
  reservationParticipants,
  scheduledTasks,
  standHoldMembers,
  standHolds,
  standReservations,
  stands,
} from "@/db/schema";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
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
    .select({ id: standHolds.id })
    .from(standHolds)
    .innerJoin(standHoldMembers, eq(standHoldMembers.holdId, standHolds.id))
    .where(
      and(
        lte(standHolds.expiresAt, input.now),
        sql`(${standHoldMembers.standId} = ${input.standId} OR (${standHolds.userId} = ${input.userId} AND ${standHolds.festivalId} = ${input.festivalId}))`,
      ),
    );

  const expiredHoldIds = [...new Set(expired.map((row) => row.id))];
  for (const holdId of expiredHoldIds) {
    // Read membership before deleting: the cascade takes the member rows with
    // the aggregate, and every one of them may need its stand released.
    const memberStandIds = await holdMemberStandIds(tx, holdId);
    await tx.delete(standHolds).where(eq(standHolds.id, holdId));
    for (const standId of memberStandIds) {
      await releaseStandIfVacant(tx, standId, input.now);
    }
  }
}

export async function createStandHold(standIdInput: unknown): Promise<
  ReservationActionResult<{
    holdId?: number;
    alreadyHeld?: boolean;
    reservationId?: number;
    /** True when the hold covers both halves of a declared full table. */
    isFullTable?: boolean;
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

      // Full-table access is resolved before locking so the companion half is
      // in the lock set from the start; locking it later would invert the
      // ascending-id order this transaction shares with every other writer.
      // Categories that can never activate the feature skip the lookup, which
      // is most participants.
      const access = isFullTableCategory(actor.category)
        ? await findActiveFullTableAccess(tx, {
            userId: actor.id,
            festivalId: stand.festivalId,
          })
        : null;
      const pair = access
        ? await resolveFullTableCompanion(tx, stand.id)
        : null;

      const standIdsToLock = uniqueSortedIds([
        stand.id,
        ...(pair ? [pair.companionStandId] : []),
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
          individualPrice: stands.individualPrice,
          sharedPrice: stands.sharedPrice,
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

      // The companion is re-checked under its own lock. If it went while the
      // participant was choosing, the selected half stays reservable and the
      // hold quietly becomes a half-table one — the fallback the PRD requires,
      // which the confirmation screens then have to state explicitly.
      const companionAvailable =
        pair != null &&
        (await availableStandIds(tx, [pair.companionStandId], now)).has(
          pair.companionStandId,
        );
      const memberStandIds =
        pair && companionAvailable
          ? [freshStand.id, pair.companionStandId]
          : [freshStand.id];

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
          priceAmountSnapshot: roundMoney(freshStand.individualPrice ?? 0),
          // Both illustration prices are snapshotted even when the participant
          // is booking alone, so a later partner addition prices off the stand
          // as it stood at hold time (PRD §6.1).
          individualPriceSnapshot: roundMoney(freshStand.individualPrice ?? 0),
          sharedPriceSnapshot:
            freshStand.sharedPrice == null
              ? null
              : roundMoney(freshStand.sharedPrice),
          idempotencyKey,
        })
        .returning();

      await insertHoldMembers(tx, hold.id, memberStandIds);

      await tx
        .update(stands)
        .set({ status: "held", updatedAt: now })
        .where(inArray(stands.id, memberStandIds));

      const isFullTable = memberStandIds.length > 1;
      return finish(
        reservationSuccess(
          { holdId: hold.id, isFullTable },
          isFullTable
            ? "Mesa completa reservada temporalmente"
            : "Espacio reservado temporalmente",
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

      // Lock every member stand, not just the adapter column, so cancelling a
      // full-table hold frees both halves atomically.
      const previewStandIds = await holdMemberStandIds(tx, preview.id);
      const locked = await lockReservationAggregate(tx, {
        festivalId: preview.festivalId,
        userIds: [actor.id],
        standIds:
          previewStandIds.length > 0 ? previewStandIds : [preview.standId],
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

      const memberStandIds = await holdMemberStandIds(tx, hold.id);
      await tx.delete(standHolds).where(eq(standHolds.id, hold.id));
      for (const standId of memberStandIds) {
        await releaseStandIfVacant(tx, standId);
      }
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
        standIndividualPrice: stands.individualPrice,
        standSharedPrice: stands.sharedPrice,
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
      // Every member stand is locked, ascending, so a full table is confirmed
      // as one aggregate rather than two racing single-stand reservations.
      const previewMemberStandIds = await holdMemberStandIds(
        tx,
        holdPreview.id,
      );
      const locked = await lockReservationAggregate(tx, {
        festivalId: holdPreview.festivalId,
        userIds: participantIds,
        standIds:
          previewMemberStandIds.length > 0
            ? previewMemberStandIds
            : [holdPreview.standId],
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

      // Membership is re-read under the aggregate lock: the set that gets
      // reserved is the one this transaction verified, not the one previewed.
      const memberStandIds = await holdMemberStandIds(tx, hold.id);
      if (memberStandIds.length === 0) {
        return finish(reservationFailure("HOLD_EXPIRED"));
      }
      const isFullTable = memberStandIds.length > 1;

      const fullTableAccess = isFullTableCategory(actor.category)
        ? await findActiveFullTableAccess(tx, {
            userId: actor.id,
            festivalId: hold.festivalId,
          })
        : null;

      const individualPrice = roundMoney(
        hold.individualPriceSnapshot ??
          hold.priceAmountSnapshot ??
          hold.standIndividualPrice ??
          0,
      );
      const sharedPrice =
        hold.sharedPriceSnapshot ??
        (hold.standSharedPrice == null
          ? null
          : roundMoney(hold.standSharedPrice));

      // PRD §6.1: the initial invoice uses the price matching the participant
      // count confirmed at booking. The shared price is the total for owner
      // plus partner and stays owner-paid; until an admin configures one it is
      // null and a two-person booking still bills the individual price.
      const standPrice =
        participantIds.length > 1 && sharedPrice != null
          ? sharedPrice
          : individualPrice;

      const [reservation] = await tx
        .insert(standReservations)
        .values({
          festivalId: hold.festivalId,
          standId: hold.standId,
          source: "user_reservation",
          ownerUserId: actor.id,
          priceAmountSnapshot: standPrice,
          individualPriceSnapshot: individualPrice,
          sharedPriceSnapshot: sharedPrice,
          bookedParticipantCount: participantIds.length,
          idempotencyKey,
        })
        .returning();

      await insertReservationMembers(tx, reservation.id, memberStandIds);

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
        payload: {
          standId: hold.standId,
          standIds: memberStandIds,
          partnerId: partnerId ?? null,
          fullTable: isFullTable,
        },
      });

      const updatedStands = await tx
        .update(stands)
        .set({ status: "reserved", updatedAt: new Date() })
        .where(
          and(inArray(stands.id, memberStandIds), eq(stands.status, "held")),
        )
        .returning({ id: stands.id });
      if (updatedStands.length !== memberStandIds.length) {
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

      // Credit classes come last in the §14 lock order, so the hold is settled
      // only once the reservation and its invoice exist.
      if (fullTableAccess) {
        if (isFullTable) {
          // The companion half was allocated, so the feature is earned.
          const captured = await captureCreditHoldForFeatureInTx(tx, {
            userId: actor.id,
            featureActionId: fullTableAccess.featureActionId,
            idempotencyKey: `full-table-capture:${idempotencyKey}`,
          });
          // Throwing rolls the whole transaction back: returning here would
          // commit the reservation, its invoice and the reserved stands while
          // the credits stayed on hold. The outer catch maps it to
          // CONFLICT_RETRY, same as the stand-status conflict above.
          if (!captured.ok) throw new Error("full_table_capture_conflict");
          await tx
            .update(reservationFeatureActions)
            .set({
              status: "fulfilled",
              reservationId: reservation.id,
              fulfilledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              eq(reservationFeatureActions.id, fullTableAccess.featureActionId),
            );
        } else {
          // Half-table fallback: the participant is not charged, and the freed
          // credits can go toward this very invoice if they choose.
          const released = await releaseCreditHoldForFeatureInTx(tx, {
            userId: actor.id,
            featureActionId: fullTableAccess.featureActionId,
            status: "released",
          });
          // Same rollback reasoning as the capture path above.
          if (!released.ok) throw new Error("full_table_release_conflict");
          await tx
            .update(reservationFeatureActions)
            .set({ status: "cancelled", updatedAt: new Date() })
            .where(
              eq(reservationFeatureActions.id, fullTableAccess.featureActionId),
            );
        }
      }

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
      .select({
        id: standHolds.id,
        standId: standHoldMembers.standId,
      })
      .from(standHolds)
      .innerJoin(standHoldMembers, eq(standHoldMembers.holdId, standHolds.id))
      .where(lte(standHolds.expiresAt, now));

    if (expiredHolds.length === 0) return { expired: 0 };

    const expiredHoldIds = [...new Set(expiredHolds.map((row) => row.id))];

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

      for (const holdId of expiredHoldIds) {
        const memberStandIds = await holdMemberStandIds(tx, holdId);
        await tx.delete(standHolds).where(eq(standHolds.id, holdId));
        for (const standId of memberStandIds) {
          await releaseStandIfVacant(tx, standId, now);
        }
      }
    });

    return { expired: expiredHoldIds.length };
  } catch (error) {
    console.error("Error cleaning up expired holds", error);
    return { expired: 0 };
  }
}
