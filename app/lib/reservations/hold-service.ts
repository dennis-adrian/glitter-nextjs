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
  lockParticipants,
  lockStandRows,
} from "@/app/lib/reservations/locks";
import { roundMoney } from "@/app/lib/reservations/money";
import {
  enqueueAdminAndOwnerNotifications,
  scheduleReservationNotificationJobs,
} from "@/app/lib/reservations/notification-outbox";
import {
  parseConfirmHoldInput,
  parseHoldIdInput,
  parseHoldStandInput,
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
  if (!actor) return { actor: null, denial: reservationFailure("UNAUTHENTICATED") };
  return { actor, denial: null };
}

async function findLiveSelfServiceReservation(
  tx: DbTx,
  userId: number,
  festivalId?: number,
) {
  const conditions = [
    eq(reservationParticipants.userId, userId),
    sql`${standReservations.status} <> 'rejected'`,
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
        and(eq(standHolds.standId, hold.standId), gt(standHolds.expiresAt, input.now)),
      )
      .limit(1);
    const [liveReservation] = await tx
      .select({ id: standReservations.id })
      .from(standReservations)
      .where(
        and(
          eq(standReservations.standId, hold.standId),
          sql`${standReservations.status} <> 'rejected'`,
        ),
      )
      .limit(1);
    if (!liveHold && !liveReservation) {
      await tx
        .update(stands)
        .set({ status: "available", updatedAt: input.now })
        .where(and(eq(stands.id, hold.standId), eq(stands.status, "held")));
    }
  }
}

export async function createStandHold(
  standIdInput: unknown,
): Promise<
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
  const now = new Date();

  try {
    const result = await db.transaction(async (tx) => {
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
        .limit(1)
        .for("update");

      if (!stand) return reservationFailure("STAND_NOT_FOUND");
      if (stand.festivalId == null) {
        return reservationFailure("STAND_WRONG_FESTIVAL");
      }

      await lockFestivalRow(tx, stand.festivalId);
      await lockParticipants(tx, stand.festivalId, [actor.id]);

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
      if (!freshStand) return reservationFailure("STAND_NOT_FOUND");
      if (freshStand.festivalId == null) {
        return reservationFailure("STAND_WRONG_FESTIVAL");
      }

      const idempotencyKey = parsed.data.idempotencyKey;
      if (idempotencyKey) {
        const [holdByKey] = await tx
          .select({ id: standHolds.id, standId: standHolds.standId })
          .from(standHolds)
          .where(
            and(
              eq(standHolds.idempotencyKey, idempotencyKey),
              eq(standHolds.userId, actor.id),
              gt(standHolds.expiresAt, now),
            ),
          )
          .limit(1);
        if (holdByKey) {
          return reservationSuccess(
            { holdId: holdByKey.id, alreadyHeld: true },
            "Ya tenés este espacio en espera",
          );
        }
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
          if (replayed) return replayed;
        }
        return blocked;
      }

      const ineligibleStand = await denyIfStandNotEligibleForProfile(tx, {
        standId: freshStand.id,
        standCategory: freshStand.standCategory,
        participationType: freshStand.participationType,
        userId: actor.id,
      });
      if (ineligibleStand) return ineligibleStand;

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
        return reservationSuccess(
          { holdId: existingHold[0].id, alreadyHeld: true },
          "Ya tenés este espacio en espera",
        );
      }

      if (existingHold.length > 0) {
        const oldStandId = existingHold[0].standId;
        const [firstId, secondId] =
          oldStandId < freshStand.id
            ? [oldStandId, freshStand.id]
            : [freshStand.id, oldStandId];
        if (firstId !== freshStand.id) {
          await tx
            .select({ id: stands.id })
            .from(stands)
            .where(eq(stands.id, firstId))
            .limit(1)
            .for("update");
        }

        if (freshStand.status !== "available") {
          return reservationFailure("STAND_UNAVAILABLE");
        }

        await tx.delete(standHolds).where(eq(standHolds.id, existingHold[0].id));
        await tx
          .update(stands)
          .set({ status: "available", updatedAt: now })
          .where(and(eq(stands.id, oldStandId), eq(stands.status, "held")));
      }

      const [currentStand] = await tx
        .select({ status: stands.status })
        .from(stands)
        .where(eq(stands.id, standId))
        .limit(1)
        .for("update");
      if (!currentStand || currentStand.status !== "available") {
        return reservationFailure("STAND_UNAVAILABLE");
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
          idempotencyKey: parsed.data.idempotencyKey,
        })
        .returning();

      await tx
        .update(stands)
        .set({ status: "held", updatedAt: now })
        .where(eq(stands.id, standId));

      return reservationSuccess(
        { holdId: hold.id },
        "Espacio reservado temporalmente",
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
    await db.transaction(async (tx) => {
      const [hold] = await tx
        .select({ id: standHolds.id, standId: standHolds.standId })
        .from(standHolds)
        .where(
          and(eq(standHolds.id, parsed.data.holdId), eq(standHolds.userId, actor.id)),
        )
        .limit(1);

      if (!hold) return;

      await tx.delete(standHolds).where(eq(standHolds.id, hold.id));
      await tx
        .update(stands)
        .set({ status: "available", updatedAt: new Date() })
        .where(and(eq(stands.id, hold.standId), eq(stands.status, "held")));
    });

    guardedRevalidate();
    return reservationSuccess(undefined, "Reserva temporal cancelada");
  } catch (error) {
    console.error("Error cancelling stand hold", error);
    return reservationFailure("CONFLICT_RETRY");
  }
}

export async function confirmStandHold(
  holdIdInput: unknown,
  partnerIdInput?: unknown,
): Promise<ReservationActionResult<{ reservationId: number }>> {
  const parsed = parseConfirmHoldInput(holdIdInput, partnerIdInput);
  if (!parsed.success) return reservationFailure("VALIDATION");
      const { holdId, partnerId, idempotencyKey } = parsed.data;

  const { actor, denial } = await requireSelfServiceActor();
  if (!actor || denial) return denial!;

  try {
    const result = await db.transaction(async (tx) => {
      if (idempotencyKey) {
        const [reservationByKey] = await tx
          .select({ id: standReservations.id })
          .from(standReservations)
          .where(
            and(
              eq(standReservations.idempotencyKey, idempotencyKey),
              eq(standReservations.ownerUserId, actor.id),
              sql`${standReservations.status} <> 'rejected'`,
            ),
          )
          .limit(1);
        if (reservationByKey) {
          return reservationSuccess(
            { reservationId: reservationByKey.id },
            "Ya tenés una reserva vigente en este festival.",
          );
        }
      }

      const holdSelect = {
        id: standHolds.id,
        standId: standHolds.standId,
        festivalId: standHolds.festivalId,
        userId: standHolds.userId,
        priceAmountSnapshot: standHolds.priceAmountSnapshot,
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
          .where(and(eq(standHolds.id, holdId), eq(standHolds.userId, actor.id)))
          .limit(1);
        if (ownedHold?.festivalId == null) {
          return reservationFailure("HOLD_EXPIRED");
        }
        const replayed = await replayLiveSelfServiceReservation(
          tx,
          actor.id,
          ownedHold.festivalId,
        );
        if (replayed) return replayed;
        return reservationFailure("HOLD_EXPIRED");
      }
      if (holdPreview.festivalId !== holdPreview.standFestivalId) {
        return reservationFailure("STAND_WRONG_FESTIVAL");
      }
      if (holdPreview.standStatus !== "held") {
        return reservationFailure("STAND_UNAVAILABLE");
      }

      await lockFestivalRow(tx, holdPreview.festivalId);
      await lockStandRows(tx, [holdPreview.standId]);
      await lockParticipants(
        tx,
        holdPreview.festivalId,
        partnerId ? [actor.id, partnerId] : [actor.id],
      );

      const [hold] = await tx
        .select(holdSelect)
        .from(standHolds)
        .innerJoin(stands, eq(stands.id, standHolds.standId))
        .where(holdWhere)
        .limit(1)
        .for("update");

      if (!hold) {
        const replayed = await replayLiveSelfServiceReservation(
          tx,
          actor.id,
          holdPreview.festivalId,
        );
        if (replayed) return replayed;
        return reservationFailure("HOLD_EXPIRED");
      }
      if (hold.festivalId !== hold.standFestivalId) {
        return reservationFailure("STAND_WRONG_FESTIVAL");
      }
      if (hold.standStatus !== "held") {
        return reservationFailure("STAND_UNAVAILABLE");
      }

      if (partnerId === actor.id) {
        return reservationFailure("PARTNER_NOT_ELIGIBLE");
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
          if (replayed) return replayed;
        }
        return ownerBlocked;
      }

      const ineligibleStand = await denyIfStandNotEligibleForProfile(tx, {
        standId: hold.standId,
        standCategory: hold.standCategory,
        participationType: hold.participationType,
        userId: actor.id,
      });
      if (ineligibleStand) return ineligibleStand;

      if (partnerId) {
        const partnerBlocked = await denySelfServiceMutation(tx, {
          actor: { id: actor.id, role: actor.role },
          userId: partnerId,
          festivalId: hold.festivalId,
          asPartner: true,
        });
        if (partnerBlocked) return partnerBlocked;
      }

      const participantIds = partnerId ? [actor.id, partnerId] : [actor.id];
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

      const admins = await fetchAdminUsers();
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

      return {
        success: true as const,
        reservationId: reservation.id,
        jobIds,
        message: "Reserva creada",
      };
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
    scheduleReservationNotificationJobs(payload.jobIds ?? payload.data?.jobIds ?? []);
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
      const standIds = [...new Set(expiredHolds.map((hold) => hold.standId))].sort(
        (a, b) => a - b,
      );
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
            and(eq(standHolds.standId, hold.standId), gt(standHolds.expiresAt, now)),
          )
          .limit(1);
        const [liveReservation] = await tx
          .select({ id: standReservations.id })
          .from(standReservations)
          .where(
            and(
              eq(standReservations.standId, hold.standId),
              sql`${standReservations.status} <> 'rejected'`,
            ),
          )
          .limit(1);
        if (!liveHold && !liveReservation) {
          await tx
            .update(stands)
            .set({ status: "available", updatedAt: now })
            .where(and(eq(stands.id, hold.standId), eq(stands.status, "held")));
        }
      }
    });

    return { expired: expiredHolds.length };
  } catch (error) {
    console.error("Error cleaning up expired holds", error);
    return { expired: 0 };
  }
}
