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
import { applyReservationCancellation, cancelReservation } from "@/app/lib/reservations/admin-service";
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
  const profile = await getCurrentUserProfile();
  if (!canMutateAdminReservations(profile)) {
    return { success: false, message: "No autorizado para actualizar la reserva." };
  }

  const idParsed = parseUnknown(positiveIntSchema, id);
  const dataParsed = parseUnknown(
    z.object({
      status: z.enum(["pending", "verification_payment", "accepted", "rejected"]),
    }),
    data,
  );
  if (!idParsed.success || !dataParsed.success) {
    return { success: false, message: "Datos inválidos." };
  }

  try {
    await db.transaction(async (tx) => {
      const [reservation] = await tx
        .select()
        .from(standReservations)
        .where(eq(standReservations.id, idParsed.data))
        .limit(1)
        .for("update");
      if (!reservation) {
        throw new Error("not_found");
      }

      const { status } = dataParsed.data;
      await tx
        .update(standReservations)
        .set({
          status,
          ...(status === "rejected" ? { revealAt: null } : {}),
        })
        .where(eq(standReservations.id, reservation.id));

      const standStatus = ["accepted", "verification_payment"].includes(status)
        ? "confirmed"
        : "available";
      await tx
        .update(stands)
        .set({ status: standStatus })
        .where(eq(stands.id, reservation.standId));
    });
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al actualizar la reserva" };
  }

  revalidatePath("/dashboard/festivals/[id]/reservations", "page");
  return { success: true, message: "Reserva actualizada" };
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
  const profile = await getCurrentUserProfile();
  if (!canMutateAdminReservations(profile)) {
    return {
      success: false,
      message: "No autorizado para confirmar la reserva.",
    };
  }

  const reservationRow = await db.query.standReservations.findFirst({
    where: eq(standReservations.id, reservationId),
    columns: { id: true, standId: true },
  });
  if (!reservationRow) {
    return { success: false, message: "La reserva no existe." };
  }
  if (standId !== reservationRow.standId) {
    return { success: false, message: "La reserva no coincide con el espacio." };
  }
  if (paidInvoiceId !== undefined) {
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, paidInvoiceId),
      columns: { id: true, reservationId: true },
    });
    if (!invoice || invoice.reservationId !== reservationId) {
      return {
        success: false,
        message: "El pago no corresponde a esta reserva.",
      };
    }
  }

  try {
    if (tx) {
      await applyConfirmReservationMutations(tx, {
        reservationId,
        standId,
        paidInvoiceId,
        actorUserId: profile?.id,
      });
      // Side effects run after the caller's transaction commits.
      return { success: true, message: "Reserva confirmada" };
    }

    await db.transaction(async (innerTx) => {
      await applyConfirmReservationMutations(innerTx, {
        reservationId,
        standId,
        paidInvoiceId,
        actorUserId: profile?.id,
      });
    });
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al confirmar la reserva" };
  }

  // Post-commit side effects (canonical lookup + emails) must never fail a
  // confirmation that already committed: guard them and log without
  // propagating, then always revalidate and return success.
  try {
    // Load canonical reservation data so confirmation emails are addressed from
    // server-side records rather than caller-supplied values.
    const reservation = await db.query.standReservations.findFirst({
      where: eq(standReservations.id, reservationId),
      with: {
        stand: true,
        festival: { with: { festivalDates: true } },
        participants: { with: { user: true } },
        invoices: { with: { user: true } },
      },
    });

    if (reservation) {
      // Address the email from the paid invoice's owner when known, falling
      // back to the reservation's first invoice owner otherwise.
      const paidInvoice =
        paidInvoiceId !== undefined
          ? reservation.invoices.find((invoice) => invoice.id === paidInvoiceId)
          : undefined;
      const owner = paidInvoice?.user ?? reservation.invoices[0]?.user;

      await sendReservationConfirmationEmails({
        user: owner,
        standLabel: formatStandLabel(reservation.stand),
        festival: reservation.festival,
        participants: reservation.participants,
      });
    }
  } catch (error) {
    console.error("[confirmReservation] Post-commit processing failed:", error);
  }

  revalidatePath("/dashboard/festivals/[id]/payments", "page");
  return { success: true, message: "Reserva confirmada" };
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
    const outcome = await db.transaction(async (tx) => {
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
        eventType: "rejected",
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
    return { success: true, message: "Reserva cancelada correctamente" };
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al cancelar la reserva" };
  }
}
