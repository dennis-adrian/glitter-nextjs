import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";

import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import { RESERVATION_ERROR_MESSAGES } from "@/app/lib/reservations/errors";
import {
  lockFestivalRow,
  lockFestivalTermsDocument,
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
  updateReservationPartnerSchema,
} from "@/app/lib/reservations/schemas";
import { getReservationEligibility } from "@/app/lib/sanctions/reservation-eligibility";
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
  await lockReservationWriteSet(tx, {
    festivalId: reservation.festivalId,
    userIds,
    standId: reservation.standId,
  });
}

async function lockReservationWriteSet(
  tx: DbTx,
  input: {
    festivalId: number;
    userIds: readonly number[];
    standId: number;
  },
) {
  await lockParticipants(tx, input.festivalId, input.userIds);
  await lockFestivalRow(tx, input.festivalId);
  await lockFestivalTermsDocument(tx);
  await lockParticipantEligibilityRows(tx, input.festivalId, input.userIds);
  await lockStandRows(tx, [input.standId]);
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

export async function updateReservationPartner(
  input: unknown,
): Promise<{ success: boolean; message: string }> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado" };
  }

  const parsed = parseUnknown(updateReservationPartnerSchema, input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }

  const { reservationId, partnerUserId } = parsed.data;

  try {
    const outcome = await db.transaction(async (tx) => {
      const [preview] = await tx
        .select({
          id: standReservations.id,
          status: standReservations.status,
          standId: standReservations.standId,
          festivalId: standReservations.festivalId,
          ownerUserId: standReservations.ownerUserId,
        })
        .from(standReservations)
        .where(eq(standReservations.id, reservationId))
        .limit(1);
      if (!preview) {
        return { success: false as const, message: "La reserva no existe" };
      }

      const existingParticipants = await tx
        .select({
          id: reservationParticipants.id,
          userId: reservationParticipants.userId,
        })
        .from(reservationParticipants)
        .where(eq(reservationParticipants.reservationId, preview.id));

      const [ownerInvoice] = await tx
        .select({ userId: invoices.userId })
        .from(invoices)
        .where(eq(invoices.reservationId, preview.id))
        .limit(1);

      const ownerUserId =
        preview.ownerUserId ??
        ownerInvoice?.userId ??
        existingParticipants[0]?.userId;
      if (ownerUserId == null) {
        return {
          success: false as const,
          message: "La reserva no tiene un participante principal",
        };
      }

      const partnerRows = existingParticipants.filter(
        (row) => row.userId !== ownerUserId,
      );
      const userIds = [
        ownerUserId,
        ...partnerRows.map((row) => row.userId),
        ...(partnerUserId != null ? [partnerUserId] : []),
      ];

      await lockReservationWriteSet(tx, {
        festivalId: preview.festivalId,
        userIds,
        standId: preview.standId,
      });

      const [reservation] = await tx
        .select({
          id: standReservations.id,
          status: standReservations.status,
          standId: standReservations.standId,
          festivalId: standReservations.festivalId,
          ownerUserId: standReservations.ownerUserId,
        })
        .from(standReservations)
        .where(eq(standReservations.id, reservationId))
        .limit(1)
        .for("update");
      if (!reservation) {
        return { success: false as const, message: "La reserva no existe" };
      }
      if (reservation.status === "rejected") {
        return {
          success: false as const,
          message: "No se puede editar una reserva rechazada",
        };
      }

      if (partnerUserId != null) {
        if (partnerUserId === ownerUserId) {
          return {
            success: false as const,
            message: "El compañero no puede ser el usuario principal",
          };
        }

        const [partnerUser] = await tx
          .select({ id: users.id, status: users.status })
          .from(users)
          .where(eq(users.id, partnerUserId))
          .limit(1);
        if (!partnerUser || partnerUser.status !== "verified") {
          return {
            success: false as const,
            message: "El compañero seleccionado no está verificado",
          };
        }

        const eligibility = await getReservationEligibility(
          { userId: partnerUserId, festivalId: reservation.festivalId },
          tx,
        );
        if (!eligibility.eligible) {
          return {
            success: false as const,
            message: `El compañero seleccionado no puede participar en esta reserva. ${eligibility.message}`,
          };
        }

        const otherMemberships = await tx
          .select({ reservationId: reservationParticipants.reservationId })
          .from(reservationParticipants)
          .innerJoin(
            standReservations,
            eq(standReservations.id, reservationParticipants.reservationId),
          )
          .where(
            and(
              eq(reservationParticipants.userId, partnerUserId),
              eq(standReservations.festivalId, reservation.festivalId),
              ne(standReservations.id, reservation.id),
            ),
          )
          .limit(1);
        if (otherMemberships.length > 0) {
          return {
            success: false as const,
            message: "El compañero seleccionado ya tiene una reserva en este festival",
          };
        }
      }

      const currentPartner = partnerRows[0];
      if (partnerUserId == null) {
        if (partnerRows.length > 0) {
          await tx
            .delete(reservationParticipants)
            .where(
              and(
                eq(reservationParticipants.reservationId, reservation.id),
                ne(reservationParticipants.userId, ownerUserId),
              ),
            );
        }
      } else if (currentPartner && currentPartner.userId === partnerUserId) {
        return { success: true as const };
      } else if (currentPartner) {
        await tx
          .update(reservationParticipants)
          .set({ userId: partnerUserId, updatedAt: new Date() })
          .where(eq(reservationParticipants.id, currentPartner.id));
      } else {
        await tx.insert(reservationParticipants).values({
          userId: partnerUserId,
          reservationId: reservation.id,
        });
      }

      await insertStandReservationEvent(tx, {
        reservationId: reservation.id,
        actorUserId: actor.id,
        eventType: "status_changed",
        fromStatus: reservation.status as ReservationStatus,
        toStatus: reservation.status as ReservationStatus,
        payload: { partnerUserId },
      });

      return { success: true as const };
    });

    if (!outcome.success) return outcome;

    revalidatePath("/dashboard/festivals/[id]/reservations", "page");
    return { success: true, message: "Compañero actualizado" };
  } catch (error) {
    console.error("Error updating reservation partner", error);
    return { success: false, message: "Error al actualizar el compañero" };
  }
}
