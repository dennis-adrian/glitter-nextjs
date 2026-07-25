"use server";

import { UserRequest } from "@/app/api/user_requests/definitions";
import { fetchAdminUsers } from "@/app/api/users/actions";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { db } from "@/db";
import {
  festivals,
  invoices,
  reservationParticipants,
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";
import { sendEmail } from "@/app/vendors/resend";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { BaseProfile } from "@/app/api/users/definitions";
import FestivalParticipationApprovedEmailTemplate from "@/app/emails/festival-participation-approved";
import FestivalParticipationRejectedEmailTemplate from "@/app/emails/festival-participation-rejected";
import TermsAcceptanceEmailTemplate from "@/app/emails/terms-acceptance";
import {
  FestivalBase,
  FestivalWithDates,
} from "@/app/lib/festivals/definitions";
import ReservationConfirmationEmailTemplate from "@/app/emails/reservation-confirmation";
import { ReservationParticipantWithUser } from "@/app/data/invoices/definitions";
import { StandBase } from "@/app/api/stands/definitions";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { getReservationEligibility } from "@/app/lib/sanctions/reservation-eligibility";

export async function fetchRequestsByUserId(userId: number) {
  try {
    const requests = await db.query.userRequests.findMany({
      where: eq(userRequests.userId, userId),
      with: {
        user: true,
        festival: true,
      },
    });

    return requests;
  } catch (error) {
    console.error("Error fetching user requests", error);
    return [];
  }
}

export async function updateUserRequest(id: number, data: UserRequest) {
  const { status, user, type } = data;
  const userRole = user.role;
  const newRole = status === "accepted" ? "artist" : "user";
  try {
    db.transaction(async (tx) => {
      await tx
        .update(userRequests)
        .set({ status, updatedAt: new Date() })
        .where(eq(userRequests.id, id));

      if (userRole !== "admin" && type === "become_artist") {
        await tx
          .update(users)
          .set({ role: newRole, updatedAt: new Date() })
          .where(eq(users.id, data.userId));
      }
    });
  } catch (error) {
    console.error("Error updating user request", error);
    return { message: "Error updating user request" };
  }

  if (
    status === "accepted" &&
    type === "festival_participation" &&
    data.festival
  ) {
    await sendEmail({
      to: [data.user.email],
      from: "Inscripciones Glitter <inscripciones@productoraglitter.com>",
      subject: `Tu postulación para ${data.festival.name} fue aprobada`,
      react: FestivalParticipationApprovedEmailTemplate({
        profile: data.user,
        festival: data.festival,
      }) as React.ReactElement,
    });
  }

  if (
    status === "rejected" &&
    type === "festival_participation" &&
    data.festival
  ) {
    await sendEmail({
      to: [data.user.email],
      from: "Inscripciones Glitter <inscripciones@productoraglitter.com>",
      subject: `Tu postulación para ${data.festival.name}`,
      react: FestivalParticipationRejectedEmailTemplate({
        profile: data.user,
        festival: data.festival,
      }) as React.ReactElement,
    });
  }

  revalidatePath("/dashboard", "layout");
  return { success: true };
}

export async function fetchFestivalParticipationRequests(
  festivalId: number,
): Promise<UserRequest[]> {
  try {
    const requests = await db.query.userRequests.findMany({
      where: and(
        eq(userRequests.festivalId, festivalId),
        eq(userRequests.type, "festival_participation"),
      ),
      with: {
        user: true,
        festival: true,
      },
      orderBy: (userRequests, { desc }) => [desc(userRequests.createdAt)],
    });

    return requests;
  } catch (error) {
    console.error("Error fetching festival participation requests", error);
    return [];
  }
}

export async function fetchRequests(): Promise<UserRequest[]> {
  try {
    const requests = await db.query.userRequests.findMany({
      with: {
        user: true,
        festival: true,
      },
    });

    return requests;
  } catch (error) {
    console.error("Error fetching user requests", error);
    return [];
  }
}

export async function updateReservationSimple(
  id: number,
  data: ReservationUpdateSimple,
) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }
  if (!Number.isInteger(id) || id <= 0) {
    return { success: false, message: "Reserva inválida" };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const [reservation] = await tx
        .select({
          id: standReservations.id,
          status: standReservations.status,
          standId: standReservations.standId,
          festivalId: standReservations.festivalId,
        })
        .from(standReservations)
        .where(eq(standReservations.id, id))
        .limit(1)
        .for("update");

      if (!reservation) {
        return {
          success: false as const,
          message: "La reserva no existe",
        };
      }

      const festival = await tx.query.festivals.findFirst({
        where: eq(festivals.id, reservation.festivalId),
        columns: { id: true },
      });
      if (!festival) {
        return {
          success: false as const,
          message: "El festival asociado a la reserva no existe",
        };
      }

      const { status, partner } = data;

      if (partner) {
        const ownerInvoice = await tx.query.invoices.findFirst({
          where: eq(invoices.reservationId, reservation.id),
          columns: { userId: true },
        });

        if (partner.participationId) {
          const existingPartner =
            await tx.query.reservationParticipants.findFirst({
              where: and(
                eq(reservationParticipants.id, partner.participationId),
                eq(reservationParticipants.reservationId, reservation.id),
              ),
              columns: { id: true, userId: true },
            });
          if (!existingPartner) {
            return {
              success: false as const,
              message: "El compañero no pertenece a esta reserva",
            };
          }
          if (ownerInvoice?.userId === existingPartner.userId) {
            return {
              success: false as const,
              message: "No se puede reemplazar al usuario principal",
            };
          }
        }

        if (partner.userId) {
          const partnerUser = await tx.query.users.findFirst({
            where: eq(users.id, partner.userId),
            columns: { id: true, status: true },
          });
          if (!partnerUser || partnerUser.status !== "verified") {
            return {
              success: false as const,
              message: "El compañero seleccionado no está verificado",
            };
          }
          if (ownerInvoice?.userId === partner.userId) {
            return {
              success: false as const,
              message: "El compañero no puede ser el usuario principal",
            };
          }

          const eligibility = await getReservationEligibility(
            {
              userId: partner.userId,
              festivalId: reservation.festivalId,
            },
            tx,
          );
          if (!eligibility.eligible) {
            return {
              success: false as const,
              message: `El compañero seleccionado no puede participar en esta reserva. ${eligibility.message}`,
            };
          }
        }
      }

      await tx
        .update(standReservations)
        .set({
          status,
          updatedAt: new Date(),
          ...(status === "rejected" ? { revealAt: null } : {}),
        })
        .where(eq(standReservations.id, id));

      let standStatus: StandStatus = "available";
      if (status && ["accepted", "verification_payment"].includes(status))
        standStatus = "confirmed";
      if (status === "pending") standStatus = "reserved";

      await tx
        .update(stands)
        .set({ status: standStatus, updatedAt: new Date() })
        .where(eq(stands.id, reservation.standId));

      if (partner) {
        if (partner.participationId) {
          if (partner.userId) {
            await tx
              .update(reservationParticipants)
              .set({ userId: partner.userId, updatedAt: new Date() })
              .where(
                and(
                  eq(reservationParticipants.id, partner.participationId),
                  eq(reservationParticipants.reservationId, reservation.id),
                ),
              );
          } else {
            await tx
              .delete(reservationParticipants)
              .where(
                and(
                  eq(reservationParticipants.id, partner.participationId),
                  eq(reservationParticipants.reservationId, reservation.id),
                ),
              );
          }
        } else if (partner.userId) {
          await tx
            .insert(reservationParticipants)
            .values({
              userId: partner.userId,
              reservationId: id,
            })
            .onConflictDoNothing({
              target: [
                reservationParticipants.userId,
                reservationParticipants.reservationId,
              ],
            });
        }
      }

      return {
        success: true as const,
        previousStatus: reservation.status,
      };
    });

    if (!outcome.success) return outcome;

    const { status, stand, participants, festival } = data;
    if (outcome.previousStatus !== "accepted" && status === "accepted") {
      const standLabel = formatStandLabel(stand);

      const targets = (participants ?? [])
        .map((p) => p.user)
        .filter((u): u is typeof users.$inferSelect => !!u && !!u.email?.trim())
        .map((u) => ({
          to: u.email!.trim(),
          normalizedEmail: u.email!.trim().toLowerCase(),
          user: u,
        }));

      const seen = new Set<string>();
      const uniqueTargets = targets.filter(({ normalizedEmail }) => {
        if (seen.has(normalizedEmail)) return false;
        seen.add(normalizedEmail);
        return true;
      });

      await Promise.allSettled(
        uniqueTargets.map(({ to, user }) =>
          sendEmail({
            to: [to],
            from: "Reservas Glitter <reservas@productoraglitter.com>",
            subject: `Reserva confirmada para el festival ${festival.name}`,
            react: ReservationConfirmationEmailTemplate({
              profile: user,
              standLabel,
              festival: festival,
            }) as React.ReactElement,
          }),
        ),
      );
    }
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al actualizar la reserva" };
  }

  revalidatePath("/dashboard/festivals/[id]/reservations", "page");
  return { success: true, message: "Reserva actualizada" };
}

// TODO: Move this to its own file once I ƒigure out that 'fs' error
export type ReservationStatus =
  (typeof standReservations.$inferSelect)["status"];
export type StandStatus = (typeof stands.$inferSelect)["status"];
export type ReservationUpdateSimple = typeof standReservations.$inferInsert & {
  participants: ReservationParticipantWithUser[];
  stand: StandBase;
  festival: FestivalWithDates;
  partner?: {
    participationId: number | undefined;
    userId: number | undefined;
  };
};

export async function createUserEnrollment(params: {
  profileId: BaseProfile["id"];
  profileDisplayName: BaseProfile["displayName"];
  festivalId: FestivalBase["id"];
  festivalName: FestivalBase["name"];
  festivalReservationsStartDate: FestivalBase["reservationsStartDate"];
}) {
  const {
    profileId,
    profileDisplayName,
    festivalId,
    festivalName,
    festivalReservationsStartDate,
  } = params;

  try {
    const profile = await db.query.users.findFirst({
      where: eq(users.id, profileId),
    });

    if (!profile) {
      return { success: false, message: "Perfil no encontrado." };
    }

    if (profile.status === "paused") {
      return {
        success: false,
        message:
          "Tu cuenta está pausada. Contactá a soporte para solicitar la reactivación.",
      };
    }

    if (profile.status !== "verified") {
      return {
        success: false,
        message: "Tu perfil debe estar verificado para aceptar los términos.",
      };
    }

    const existing = await db.query.userRequests.findFirst({
      where: and(
        eq(userRequests.userId, profileId),
        eq(userRequests.festivalId, festivalId),
        eq(userRequests.type, "festival_participation"),
      ),
    });

    if (existing) {
      return {
        success: true,
        message: "Ya tenés una solicitud de participación.",
      };
    }

    // Derive status from DB-backed category so callers cannot force "accepted"
    // for gastronomy enrollments via tampered input.
    const enrollmentStatus =
      profile.category === "gastronomy" ? "pending" : "accepted";

    await db.insert(userRequests).values({
      userId: profileId,
      festivalId: festivalId,
      status: enrollmentStatus,
      type: "festival_participation",
    });

    const admins = await fetchAdminUsers();
    const adminEmails = admins.map((admin) => admin.email);
    if (admins.length > 0) {
      await sendEmail({
        to: [...adminEmails],
        from: "Inscripciones Glitter <inscripciones@productoraglitter.com>",
        subject: `${profileDisplayName || "Usuario"} se ha inscrito a ${festivalName || "Festival"}`,
        react: TermsAcceptanceEmailTemplate({
          profile: {
            id: profileId,
            displayName: profileDisplayName || "Usuario",
            category: profile.category,
          },
          festival: {
            id: festivalId,
            name: festivalName,
            reservationsStartDate: festivalReservationsStartDate,
          },
        }) as React.ReactElement,
      });
    }
  } catch (error) {
    console.error(error);
    return { success: false, message: "Error al solicitar participación" };
  }

  // revalidatePath("/");
  return { success: true, message: "Ya estás habilitado para participar." };
}
