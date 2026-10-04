"use server";

import { UserRequest } from "@/app/api/user_requests/definitions";
import { fetchAdminUsers } from "@/app/lib/users/queries";
import { db } from "@/db";
import {
  festivals,
  standReservations,
  stands,
  userRequests,
  users,
} from "@/db/schema";
import { sendEmail } from "@/app/vendors/resend";
import { and, eq } from "drizzle-orm";
import { BaseProfile } from "@/app/api/users/definitions";
import TermsAcceptanceEmailTemplate from "@/app/emails/terms-acceptance";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import {
  requireAdmin,
  requireAdminOrFestivalAdmin,
  requireProfileOwnerOrAdmin,
} from "@/app/lib/users/helpers";
import { nextEnrollmentTermsWrite } from "@/app/lib/festival-terms/acceptance";
import { fetchPublishedFestivalTermsVersion } from "@/app/lib/festival-terms/queries";
import {
  FESTIVAL_PARTICIPANT_TERMS_DISABLED_MESSAGE,
  isFestivalParticipantTermsEnabled,
} from "@/app/lib/festivals/participant-terms";
import {
  reviewBecomeArtistRequest as reviewBecomeArtistRequestService,
  reviewFestivalParticipationRequest as reviewFestivalParticipationRequestService,
} from "@/app/lib/user_requests/review-service";

export async function fetchRequestsByUserId(userId: number) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return [];

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

export async function reviewFestivalParticipationRequest(input: unknown) {
  return reviewFestivalParticipationRequestService(input);
}

export async function reviewBecomeArtistRequest(input: unknown) {
  return reviewBecomeArtistRequestService(input);
}

export async function fetchFestivalParticipationRequests(
  festivalId: number,
): Promise<UserRequest[]> {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) return [];

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
  // Its only page, /dashboard/requests, renders for admins alone.
  const actor = await requireAdmin();
  if (!actor) return [];

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

// TODO: Move this to its own file once I figure out that 'fs' error
export type ReservationStatus =
  (typeof standReservations.$inferSelect)["status"];
export type StandStatus = (typeof stands.$inferSelect)["status"];

export async function createUserEnrollment(params: {
  profileId: BaseProfile["id"];
  festivalId: FestivalBase["id"];
}) {
  const { profileId, festivalId } = params;

  // The terms page admits the profile's owner and admins, who may accept on
  // a participant's behalf.
  const actor = await requireProfileOwnerOrAdmin(profileId);
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

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

    const festival = await db.query.festivals.findFirst({
      where: eq(festivals.id, festivalId),
      columns: {
        participantTermsEnabled: true,
        name: true,
        reservationsStartDate: true,
        status: true,
      },
    });
    if (!festival || !isFestivalParticipantTermsEnabled(festival)) {
      return {
        success: false,
        message: FESTIVAL_PARTICIPANT_TERMS_DISABLED_MESSAGE,
      };
    }

    // Same rule as the terms page, which only offers the form while the
    // festival is active.
    if (festival.status !== "active") {
      return {
        success: false,
        message: "El festival aún no tiene las reservas activas",
      };
    }

    const existing = await db.query.userRequests.findFirst({
      where: and(
        eq(userRequests.userId, profileId),
        eq(userRequests.festivalId, festivalId),
        eq(userRequests.type, "festival_participation"),
      ),
    });

    const publishedTerms = await fetchPublishedFestivalTermsVersion();
    const write = nextEnrollmentTermsWrite(
      existing,
      publishedTerms?.id ?? null,
    );

    if (write.type === "error") {
      return { success: false, message: write.message };
    }

    if (write.type === "noop") {
      return {
        success: true,
        message: "Ya tenés una solicitud de participación.",
      };
    }

    if (write.type === "reaccept" && existing) {
      await db
        .update(userRequests)
        .set({
          termsVersionId: publishedTerms!.id,
          updatedAt: new Date(),
        })
        .where(eq(userRequests.id, existing.id));
      return {
        success: true,
        message: "Aceptaste la nueva versión de los términos y condiciones.",
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
      termsVersionId: publishedTerms!.id,
    });

    const admins = await fetchAdminUsers();
    const adminEmails = admins.map((admin) => admin.email);
    if (admins.length > 0) {
      // Names and dates come from the rows, never from the caller, since they
      // land in the subject and body of a mail sent to every admin.
      await sendEmail({
        to: [...adminEmails],
        from: "Inscripciones Glitter <inscripciones@productoraglitter.com>",
        subject: `${profile.displayName || "Usuario"} se ha inscrito a ${festival.name || "Festival"}`,
        react: TermsAcceptanceEmailTemplate({
          profile: {
            id: profileId,
            displayName: profile.displayName || "Usuario",
            category: profile.category,
          },
          festival: {
            id: festivalId,
            name: festival.name,
            reservationsStartDate: festival.reservationsStartDate,
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
