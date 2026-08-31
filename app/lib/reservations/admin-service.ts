import "server-only";

import { eq } from "drizzle-orm";

import { insertStandReservationEvent } from "@/app/lib/reservations/events";
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

export async function applyReservationCancellation(
  tx: DbTx,
  input: {
    reservation: {
      id: number;
      standId: number;
      festivalId: number;
      status: string;
    };
    actorUserId: number;
    eventType: ReservationEventType;
    reason?: string;
    payload?: Record<string, unknown> | null;
  },
): Promise<number[]> {
  await lockFestivalRow(tx, input.reservation.festivalId);
  await lockStandRows(tx, [input.reservation.standId]);

  const participants = await tx
    .select({ userId: reservationParticipants.userId })
    .from(reservationParticipants)
    .where(eq(reservationParticipants.reservationId, input.reservation.id));
  await lockParticipants(
    tx,
    input.reservation.festivalId,
    participants.map((participant) => participant.userId),
  );

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

  const recipients = await tx
    .select({ id: users.id, email: users.email })
    .from(reservationParticipants)
    .innerJoin(users, eq(users.id, reservationParticipants.userId))
    .where(eq(reservationParticipants.reservationId, input.reservation.id));

  const jobIds: number[] = [];
  for (const recipient of recipients) {
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
    const outcome = await db.transaction(async (tx) => {
      const [preview] = await tx
        .select()
        .from(standReservations)
        .where(eq(standReservations.id, parsed.data.reservationId))
        .limit(1);
      if (!preview) {
        return { ok: false as const, message: "La reserva no existe." };
      }

      const participants = await tx
        .select({ userId: reservationParticipants.userId })
        .from(reservationParticipants)
        .where(eq(reservationParticipants.reservationId, preview.id));
      const userIds = participants.map((participant) => participant.userId);

      await lockParticipants(tx, preview.festivalId, userIds);
      await lockFestivalRow(tx, preview.festivalId);
      await lockParticipantEligibilityRows(tx, preview.festivalId, userIds);
      await lockStandRows(tx, [preview.standId]);

      const [reservation] = await tx
        .select()
        .from(standReservations)
        .where(eq(standReservations.id, parsed.data.reservationId))
        .limit(1)
        .for("update");
      if (!reservation) {
        return { ok: false as const, message: "La reserva no existe." };
      }
      if (reservation.status === "rejected") {
        return { ok: true as const, jobIds: [] as number[] };
      }

      const jobIds = await applyReservationCancellation(tx, {
        reservation,
        actorUserId,
        eventType: "deleted",
        reason: parsed.data.reason,
      });
      return { ok: true as const, jobIds };
    });

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
