"use server";

import { and, eq, not, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
import {
  ReservationWithParticipantsAndUsersAndStand,
  ReservationWithParticipantsAndUsersAndStandAndCollaborators,
  ReservationWithParticipantsAndUsersAndStandAndFestival,
} from "@/app/api/reservations/definitions";
import ReservationRejectionEmailTemplate from "@/app/emails/reservation-rejection";
import { getUserName } from "@/app/lib/users/utils";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { ReservationParticipantWithUser } from "@/app/data/invoices/definitions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { formatStandLabel } from "@/app/lib/stands/helpers";

export async function fetchConfirmedReservationsByFestival(
  festivalId: number,
): Promise<ReservationWithParticipantsAndUsersAndStandAndCollaborators[]> {
  try {
    return db.query.standReservations.findMany({
      where: and(
        eq(standReservations.festivalId, festivalId),
        eq(standReservations.status, "accepted"),
      ),
      with: {
        participants: {
          with: {
            user: {
              with: {
                userSocials: true,
              },
            },
          },
        },
        stand: true,
        collaborators: {
          with: {
            collaborator: true,
          },
        },
      },
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchValidReservationsByFestival(
  festivalId: number,
): Promise<ReservationWithParticipantsAndUsersAndStandAndCollaborators[]> {
  try {
    return db.query.standReservations.findMany({
      where: and(
        eq(standReservations.festivalId, festivalId),
        not(eq(standReservations.status, "rejected")),
      ),
      with: {
        participants: {
          with: {
            user: {
              with: {
                userSocials: true,
              },
            },
          },
        },
        stand: true,
        collaborators: {
          with: {
            collaborator: true,
          },
        },
      },
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchReservation(
  id: number,
): Promise<
  ReservationWithParticipantsAndUsersAndStandAndFestival | undefined | null
> {
  try {
    return await db.query.standReservations.findFirst({
      where: eq(standReservations.id, id),
      with: {
        participants: {
          with: {
            user: {
              with: {
                userSocials: true,
              },
            },
          },
        },
        stand: true,
        festival: {
          with: {
            festivalDates: true,
          },
        },
        scheduledTasks: true,
      },
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function updateReservation(
  id: number,
  data: ReservationWithParticipantsAndUsersAndStand,
): Promise<{ success: boolean; message: string }> {
  try {
    const { status, standId } = data;
    await db.transaction(async (tx) => {
      await tx
        .update(standReservations)
        .set({
          status,
          ...(status === "rejected" ? { revealAt: null } : {}),
        })
        .where(eq(standReservations.id, id));

      const standStatus = status === "accepted" ? "confirmed" : "available";
      await tx
        .update(stands)
        .set({ status: standStatus })
        .where(eq(stands.id, standId));
    });
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al actualizar la reserva" };
  }

  revalidatePath("/dashboard/festivals/[id]/reservations", "page");
  return { success: true, message: "Reserva actualizada" };
}

export async function deleteReservation(
  reservationId: number,
  standId: number,
) {
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(scheduledTasks)
        .where(eq(scheduledTasks.reservationId, reservationId));

      await tx
        .delete(standReservations)
        .where(eq(standReservations.id, reservationId));

      await tx
        .update(stands)
        .set({ status: "available" })
        .where(eq(stands.id, standId));
    });
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al eliminar la reserva" };
  }

  revalidatePath("/dashboard/festivals/[id]/reservations", "page");
  return { success: true, message: "Reserva eliminada" };
}

type ConfirmReservationTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyConfirmReservationMutations(
  tx: ConfirmReservationTx,
  {
    reservationId,
    standId,
    paidInvoiceId,
  }: {
    reservationId: number;
    standId: number;
    paidInvoiceId?: number;
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
  if (!profile || profile.role !== "admin") {
    return {
      success: false,
      message: "No autorizado para confirmar la reserva.",
    };
  }

  try {
    if (tx) {
      await applyConfirmReservationMutations(tx, {
        reservationId,
        standId,
        paidInvoiceId,
      });
      // Side effects run after the caller's transaction commits.
      return { success: true, message: "Reserva confirmada" };
    }

    await db.transaction(async (innerTx) => {
      await applyConfirmReservationMutations(innerTx, {
        reservationId,
        standId,
        paidInvoiceId,
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

export async function rejectReservation(
  reservation: ReservationWithParticipantsAndUsersAndStandAndFestival,
  reason?: string,
) {
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(scheduledTasks)
        .where(eq(scheduledTasks.reservationId, reservation.id));

      await tx
        .update(standReservations)
        .set({
          status: "rejected",
          revealAt: null,
          updatedAt: sql`now()`,
        })
        .where(eq(standReservations.id, reservation.id));

      await tx
        .update(stands)
        .set({ status: "available" })
        .where(eq(stands.id, reservation.standId));
    });

    const participantsWithEmail = reservation.participants.filter((p) =>
      p.user?.email?.trim(),
    );
    const sendPromises = participantsWithEmail.map((participant) => {
      const email = participant.user!.email!.trim();
      const userName = getUserName(participant.user);
      return sendEmail({
        to: [email],
        from: "Equipo Glitter <equipo@productoraglitter.com>",
        subject: `${userName}, tu reserva ha sido cancelada`,
        react: ReservationRejectionEmailTemplate({
          festival: reservation.festival,
          profile: participant.user,
          stand: reservation.stand,
          reason,
        }) as React.ReactElement,
      });
    });
    const results = await Promise.allSettled(sendPromises);
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const participant = participantsWithEmail[index];
        const userName = participant
          ? getUserName(participant.user)
          : "unknown";
        console.error(
          `[rejectReservation] Failed to send rejection email to ${userName}:`,
          result.reason,
        );
      }
    });
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al cancelar la reserva" };
  }

  revalidatePath("/dashboard/festivals/[id]/reservations", "page");
  return { success: true, message: "Reserva cancelada correctamente" };
}
