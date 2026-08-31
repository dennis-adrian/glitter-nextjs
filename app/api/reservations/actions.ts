"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  invoices,
  scheduledTasks,
  standReservations,
  stands,
} from "@/db/schema";

import { BaseProfile } from "@/app/api/users/definitions";
import { sendEmail } from "@/app/vendors/resend";
import EmailTemplate from "@/app/emails/reservation-confirmation";
import React from "react";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { ReservationParticipantWithUser } from "@/app/data/invoices/definitions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import {
  cancelReservation,
  lockAndApplyReservationCancellation,
} from "@/app/lib/reservations/admin-service";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import { scheduleReservationNotificationJobs } from "@/app/lib/reservations/notification-outbox";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import {
  parseUnknown,
  positiveIntSchema,
  rejectReservationSchema,
} from "@/app/lib/reservations/schemas";

export async function updateReservation(
  id: unknown,
  data: unknown,
): Promise<{ success: boolean; message: string }> {
  void id;
  void data;
  console.warn(
    "[updateReservation] Deprecated: use explicit settlement/admin commands.",
  );
  return {
    success: false,
    message:
      "Esta acción genérica ya no está disponible. Usá los comandos explícitos de revisión de pago.",
  };
}

export async function deleteReservation(reservationIdInput: unknown) {
  const parsed = parseUnknown(positiveIntSchema, reservationIdInput);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }
  return cancelReservation({ reservationId: parsed.data });
}

type ConfirmReservationTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyConfirmReservationMutations(
  tx: ConfirmReservationTx,
  {
    reservationId,
    standId,
    paidInvoiceId,
    actorUserId,
  }: {
    reservationId: number;
    standId: number;
    paidInvoiceId?: number;
    actorUserId?: number | null;
  },
) {
  const updatedReservations = await tx
    .update(standReservations)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(
      and(
        eq(standReservations.id, reservationId),
        eq(standReservations.standId, standId),
      ),
    )
    .returning({ id: standReservations.id });

  if (updatedReservations.length === 0) {
    throw new Error(
      "No se encontró una reserva coincidente para el espacio indicado.",
    );
  }

  await insertStandReservationEvent(tx, {
    reservationId,
    actorUserId: actorUserId ?? null,
    eventType: "confirmed",
    toStatus: "accepted",
  });

  const updatedStands = await tx
    .update(stands)
    .set({ status: "confirmed" })
    .where(eq(stands.id, standId))
    .returning({ id: stands.id });

  if (updatedStands.length === 0) {
    throw new Error("No se encontró el espacio a confirmar.");
  }

  await tx
    .update(scheduledTasks)
    .set({ completedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(scheduledTasks.reservationId, reservationId),
        eq(scheduledTasks.taskType, "stand_reservation"),
      ),
    );

  if (paidInvoiceId !== undefined) {
    const updatedInvoices = await tx
      .update(invoices)
      .set({ status: "paid", updatedAt: new Date() })
      .where(
        and(
          eq(invoices.id, paidInvoiceId),
          eq(invoices.reservationId, reservationId),
        ),
      )
      .returning({ id: invoices.id });

    if (updatedInvoices.length === 0) {
      throw new Error(
        "No se encontró un pago coincidente para marcar como pagado.",
      );
    }
  }
}

export async function sendReservationConfirmationEmails({
  user,
  standLabel,
  festival,
  participants,
}: {
  user?: BaseProfile;
  standLabel: string;
  festival: FestivalWithDates;
  participants: ReservationParticipantWithUser[];
}) {
  try {
    const targets: { to: string; profile: BaseProfile }[] = [];
    if (user?.email?.trim())
      targets.push({ to: user.email.trim(), profile: user });
    for (const p of participants) {
      const email = p.user?.email?.trim();
      if (!email) continue;
      targets.push({ to: email, profile: p.user });
    }
    const seen = new Set<string>();
    const uniqueTargets = targets.filter(({ to }) => {
      const key = to.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Wrap each send in an async boundary so sync EmailTemplate errors become
    // rejections instead of escaping Promise.allSettled construction.
    const results = await Promise.allSettled(
      uniqueTargets.map(({ to, profile }) =>
        (async () =>
          sendEmail({
            to: [to],
            from: "Reservas Glitter <reservas@productoraglitter.com>",
            subject: `Reserva confirmada para el festival ${festival.name}`,
            react: EmailTemplate({
              profile,
              standLabel,
              festival,
            }) as React.ReactElement,
          }))(),
      ),
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        // Identify the recipient only by index and log sanitized error
        // metadata, so we never leak email addresses or provider-sensitive
        // details (stack, request config, response headers) into logs.
        const { reason } = result;
        const error =
          reason instanceof Error
            ? { name: reason.name }
            : { name: typeof reason };
        console.error(
          `[sendReservationConfirmationEmails] Failed to send confirmation email for recipient #${index}:`,
          error,
        );
      }
    });
  } catch (error) {
    // Post-commit side effect: never propagate to callers.
    console.error(
      "[sendReservationConfirmationEmails] Unexpected failure after commit:",
      error,
    );
  }
}

export async function confirmReservation(
  reservationId: number,
  standId: number,
  paidInvoiceId?: number,
  tx?: ConfirmReservationTx,
) {
  void reservationId;
  void standId;
  void paidInvoiceId;
  void tx;
  console.warn(
    "[confirmReservation] Deprecated: use adminConfirmReservationAction (settlement-backed).",
  );
  return {
    success: false,
    message:
      "Esta acción ya no está disponible. Usá la confirmación respaldada por revisión de pago.",
  };
}

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
