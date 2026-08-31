import "server-only";

import { eq, inArray } from "drizzle-orm";

import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import { RESERVATION_ERROR_MESSAGES } from "@/app/lib/reservations/errors";
import {
  lockFestivalRow,
  lockParticipantEligibilityRows,
  lockParticipants,
  lockStandRows,
} from "@/app/lib/reservations/locks";
import {
  enqueueReservationNotification,
  scheduleReservationNotificationJobs,
} from "@/app/lib/reservations/notification-outbox";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import {
  cancelReservationSchema,
  parseUnknown,
} from "@/app/lib/reservations/schemas";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  invoices,
  reservationParticipants,
  reservationStatusEnum,
  scheduledTasks,
  standReservationEventTypeEnum,
  standReservations,
  stands,
  users,
} from "@/db/schema";
import { revalidatePath } from "next/cache";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ReservationEventType =
  (typeof standReservationEventTypeEnum.enumValues)[number];
type ReservationStatus = (typeof reservationStatusEnum.enumValues)[number];
type CancellationReservation = {
  id: number;
  standId: number;
  festivalId: number;
  status: string;
};

function participantIdSet(ids: readonly number[]) {
  return [
    ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
  ].sort((a, b) => a - b);
}

function sameParticipantIdSet(
  left: readonly number[],
  right: readonly number[],
) {
  const a = participantIdSet(left);
  const b = participantIdSet(right);
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

async function readReservationParticipantIds(
  tx: DbTx,
  reservationId: number,
) {
  const participants = await tx
    .select({ userId: reservationParticipants.userId })
    .from(reservationParticipants)
    .where(eq(reservationParticipants.reservationId, reservationId));
  return participants.map((participant) => participant.userId);
}

async function acquireCancellationLocks(
  tx: DbTx,
  reservation: Pick<CancellationReservation, "festivalId" | "standId">,
  userIds: readonly number[],
) {
  await lockParticipants(tx, reservation.festivalId, userIds);
  await lockFestivalRow(tx, reservation.festivalId);
  await lockParticipantEligibilityRows(
    tx,
    reservation.festivalId,
    userIds,
  );
  await lockStandRows(tx, [reservation.standId]);
}

export async function lockAndApplyReservationCancellation(
  tx: DbTx,
  input: {
    reservationId: number;
    actorUserId: number;
    eventType: ReservationEventType;
    reason?: string;
    payload?: Record<string, unknown> | null;
  },
): Promise<{ ok: true; jobIds: number[] } | { ok: false; message: string }> {
  const [preview] = await tx
    .select()
    .from(standReservations)
    .where(eq(standReservations.id, input.reservationId))
    .limit(1);
  if (!preview) {
    return { ok: false as const, message: "La reserva no existe." };
  }

  const previewUserIds = await readReservationParticipantIds(tx, preview.id);

  await acquireCancellationLocks(tx, preview, previewUserIds);

  const [reservation] = await tx
    .select()
    .from(standReservations)
    .where(eq(standReservations.id, input.reservationId))
    .limit(1)
    .for("update");
  if (!reservation) {
    return { ok: false as const, message: "La reserva no existe." };
  }
  if (reservation.status === "rejected") {
    return { ok: true as const, jobIds: [] as number[] };
  }

  const lockedUserIds = await readReservationParticipantIds(tx, reservation.id);
  if (!sameParticipantIdSet(previewUserIds, lockedUserIds)) {
    return {
      ok: false as const,
      message: RESERVATION_ERROR_MESSAGES.CONFLICT_RETRY,
    };
  }

  const jobIds = await applyReservationCancellation(tx, {
    reservation,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    reason: input.reason,
    payload: input.payload,
    participantUserIds: lockedUserIds,
  });
  return { ok: true as const, jobIds };
}

export async function applyReservationCancellation(
  tx: DbTx,
  input: {
    reservation: CancellationReservation;
    actorUserId: number;
    eventType: ReservationEventType;
    reason?: string;
    payload?: Record<string, unknown> | null;
    participantUserIds?: readonly number[];
  },
): Promise<number[]> {
  const userIds =
    input.participantUserIds !== undefined
      ? [...input.participantUserIds]
      : await readReservationParticipantIds(tx, input.reservation.id);

  await acquireCancellationLocks(tx, input.reservation, userIds);

  await tx
    .delete(scheduledTasks)
    .where(eq(scheduledTasks.reservationId, input.reservation.id));
  await tx
    .update(standReservations)
    .set({ status: "rejected", revealAt: null, updatedAt: new Date() })
    .where(eq(standReservations.id, input.reservation.id));
  await tx
    .update(invoices)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(invoices.reservationId, input.reservation.id));
  await tx
    .update(stands)
    .set({ status: "available", updatedAt: new Date() })
    .where(eq(stands.id, input.reservation.standId));

  await insertStandReservationEvent(tx, {
    reservationId: input.reservation.id,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    fromStatus: input.reservation.status as ReservationStatus,
    toStatus: "rejected",
    payload:
      input.payload ?? (input.reason ? { reason: input.reason } : null),
  });

  const recipients =
    userIds.length === 0
      ? []
      : await tx
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds));

  const allowedRecipientIds = new Set(participantIdSet(userIds));
  const jobIds: number[] = [];
  for (const recipient of recipients) {
    if (!allowedRecipientIds.has(recipient.id)) continue;
    const jobId = await enqueueReservationNotification(tx, {
      kind: "reservation_rejected",
      reservationId: input.reservation.id,
      userId: recipient.id,
      recipientEmail: recipient.email,
      payload: input.reason ? { reason: input.reason } : undefined,
    });
    if (jobId) jobIds.push(jobId);
  }
  return jobIds;
}

export async function cancelReservation(
  input: unknown,
): Promise<{ success: boolean; message: string }> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado para cancelar la reserva." };
  }
  const actorUserId = actor.id;

  const parsed = parseUnknown(cancelReservationSchema, input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }

  try {
    const outcome = await db.transaction(async (tx) =>
      lockAndApplyReservationCancellation(tx, {
        reservationId: parsed.data.reservationId,
        actorUserId,
        eventType: "deleted",
        reason: parsed.data.reason,
      }),
    );

    if (!outcome.ok) {
      return { success: false, message: outcome.message };
    }

    scheduleReservationNotificationJobs(outcome.jobIds);
    revalidatePath("/dashboard/festivals/[id]/reservations", "page");
    revalidatePath("/dashboard/festivals/[id]/payments", "page");
    return {
      success: true,
      message: "Reserva cancelada. El espacio quedó disponible.",
    };
  } catch (error) {
    console.error("Error cancelling reservation", error);
    return { success: false, message: "No se pudo cancelar la reserva." };
  }
}
