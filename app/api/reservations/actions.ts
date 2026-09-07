"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { lockAndApplyReservationCancellation } from "@/app/lib/reservations/admin-service";
import { scheduleReservationNotificationJobs } from "@/app/lib/reservations/notification-outbox";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import {
  parseUnknown,
  rejectReservationSchema,
} from "@/app/lib/reservations/schemas";

export async function rejectReservation(input: unknown) {
  const profile = await getCurrentUserProfile();
  if (!canMutateAdminReservations(profile)) {
    return { success: false, message: "No autorizado para cancelar la reserva." };
  }
  const actorUserId = profile.id;

  const parsed = parseUnknown(rejectReservationSchema, input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }

  try {
    const outcome = await db.transaction(async (tx) =>
      lockAndApplyReservationCancellation(tx, {
        reservationId: parsed.data.reservationId,
        actorUserId,
        eventType: "rejected",
        reason: parsed.data.reason,
      }),
    );

    if (!outcome.ok) {
      return { success: false, message: outcome.message };
    }

    scheduleReservationNotificationJobs(outcome.jobIds);
    revalidatePath("/dashboard/festivals/[id]/reservations", "page");
    revalidatePath("/dashboard/festivals/[id]/payments", "page");
    return { success: true, message: "Reserva cancelada correctamente" };
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al cancelar la reserva" };
  }
}
