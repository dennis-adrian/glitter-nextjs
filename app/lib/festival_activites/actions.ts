"use server";

import { fetchAdminUsers } from "@/app/lib/users/queries";
import { BaseProfile, UserCategory } from "@/app/api/users/definitions";
import FestivalActivityRegistrationEmail from "@/app/emails/festival-activity-registration";
import type {
  FestivalActivityVoteInput,
  SignedActivityProofUpload,
} from "@/app/lib/festival_activites/definitions";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import {
  ActivityDetailsWithParticipants,
  FestivalActivity,
  FestivalBase,
} from "@/app/lib/festivals/definitions";
import { sendEmail } from "@/app/vendors/resend";
import { assertSent } from "@/app/vendors/resend-result";
import { db } from "@/db";
import {
  festivalActivities,
  festivalActivityDetails,
  festivalActivityParticipantProofs,
  festivalActivityParticipants,
  festivalActivityVotes,
  festivalActivityWaitlist,
  reservationParticipants,
  standReservations,
  stands,
} from "@/db/schema";
import {
  attemptStorageCleanupJob,
  enqueueStorageCleanupJob,
} from "@/app/lib/uploadthing/storage";
import { verifyUploadReceipt } from "@/app/lib/uploadthing/upload-receipt";
import { getProofUploadExpiredMessage } from "@/app/lib/festival_activites/helpers";
import {
  fetchActivityParticipationOwnerId,
  fetchParticipationPreviewDataBatch,
  type ParticipationPreviewData,
  wasRemovedFromActivity,
} from "@/app/lib/festival_activites/queries";
import {
  getCurrentUserProfile,
  requireProfileOwnerOrAdmin,
} from "@/app/lib/users/helpers";
import {
  and,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

const PROOF_STATUS_CHANGED = "PROOF_STATUS_CHANGED";

async function fetchVerifiedActivityProfile(profileId: number) {
  const currentProfile = await getCurrentUserProfile();

  if (
    !currentProfile ||
    currentProfile.id !== profileId ||
    currentProfile.status !== "verified"
  ) {
    return null;
  }

  return currentProfile;
}

const inactiveParticipantMessage =
  "Tu perfil debe estar verificado y activo para participar en actividades.";

const removedParticipantMessage =
  "No podés volver a inscribirte después de haber sido removido";

/** A vote the rules refuse; its message is shown to the voter as is. */
class VoteRejectedError extends Error {}

/**
 * Condition on a `festivalActivityParticipants` query: the participation has
 * an uploaded design. The voting page lists only those entries, so a vote may
 * only go to one of them.
 */
function hasUploadedDesign() {
  return sql`exists (
    select 1 from ${festivalActivityParticipantProofs}
    where ${festivalActivityParticipantProofs.participationId} = ${festivalActivityParticipants.id}
      and ${festivalActivityParticipantProofs.imageUrl} is not null
  )`;
}

/**
 * Tells admins about a new enrollment. The enrollment is already committed, so
 * a failure here is logged rather than reported as a failed enrollment, which
 * a retry would only meet with "Ya estás inscrito".
 */
async function notifyAdminsOfEnrollment(input: {
  festivalId: FestivalBase["id"];
  activityName: string;
  userDisplayName: string | null;
}) {
  try {
    // Fetched here because passing down the whole festival is too cumbersome.
    const festival = await fetchBaseFestival(input.festivalId);
    const admins = await fetchAdminUsers();
    const adminEmails = admins.map((admin) => admin.email);

    const result = await sendEmail({
      from: "Actividades del Festival <no-reply@productoraglitter.com>",
      to: [...adminEmails],
      subject: "Inscripción a una actividad del festival",
      react: FestivalActivityRegistrationEmail({
        festivalActivityName: input.activityName,
        userDisplayName: input.userDisplayName,
        festivalName: festival?.name,
        festivalType: festival?.festivalType,
      }),
    });
    assertSent(result);
  } catch (error) {
    console.error("Error notifying admins of activity enrollment", error);
  }
}

export const addFestivalActivityVote = async (
  vote: FestivalActivityVoteInput,
) => {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser) {
    return {
      success: false,
      message: "Usuario no autenticado.",
    };
  }

  if (currentUser.status !== "verified") {
    return {
      success: false,
      message: inactiveParticipantMessage,
    };
  }

  // Only these fields reach the insert; the voter comes from the session.
  const activityVariantId = vote.activityVariantId;
  const standId = vote.votableType === "stand" ? vote.standId : null;
  const participantId =
    vote.votableType === "participant" ? vote.participantId : null;

  if (!Number.isInteger(activityVariantId)) {
    return { success: false, message: "La votación no existe" };
  }

  if (vote.votableType === "stand" && !Number.isInteger(standId)) {
    return {
      success: false,
      message: "El stand no existe",
    };
  }

  if (vote.votableType === "participant" && !Number.isInteger(participantId)) {
    return {
      success: false,
      message: "El participante no existe",
    };
  }

  if (standId === null && participantId === null) {
    return { success: false, message: "Voto no válido" };
  }

  try {
    await db.transaction(async (tx) => {
      const [variant] = await tx
        .select({
          festivalId: festivalActivities.festivalId,
          allowsVoting: festivalActivities.allowsVoting,
          votingStartDate: festivalActivities.votingStartDate,
          votingEndDate: festivalActivities.votingEndDate,
        })
        .from(festivalActivityDetails)
        .innerJoin(
          festivalActivities,
          eq(festivalActivities.id, festivalActivityDetails.activityId),
        )
        .where(eq(festivalActivityDetails.id, activityVariantId))
        .limit(1);

      if (!variant || !variant.allowsVoting) {
        throw new VoteRejectedError("Esta actividad no tiene votación");
      }

      // Same window the voting page enforces: no dates means voting is closed.
      const now = new Date();
      if (
        !variant.votingStartDate ||
        !variant.votingEndDate ||
        now < variant.votingStartDate ||
        now > variant.votingEndDate
      ) {
        throw new VoteRejectedError("La votación no está abierta");
      }

      if (participantId !== null) {
        const [participant] = await tx
          .select({ userId: festivalActivityParticipants.userId })
          .from(festivalActivityParticipants)
          .where(
            and(
              eq(festivalActivityParticipants.id, participantId),
              eq(festivalActivityParticipants.detailsId, activityVariantId),
              isNull(festivalActivityParticipants.removedAt),
              hasUploadedDesign(),
            ),
          )
          .limit(1);

        if (!participant) {
          throw new VoteRejectedError("El participante no existe");
        }
        if (participant.userId === currentUser.id) {
          throw new VoteRejectedError("No podés votar por tu propio diseño");
        }
      }

      if (standId !== null) {
        // The stand must be held, through an accepted reservation of this
        // festival, by someone still enrolled in this variant with a design.
        const standHolders = await tx
          .select({ userId: reservationParticipants.userId })
          .from(standReservations)
          .innerJoin(
            reservationParticipants,
            eq(reservationParticipants.reservationId, standReservations.id),
          )
          .where(
            and(
              eq(standReservations.standId, standId),
              eq(standReservations.festivalId, variant.festivalId),
              eq(standReservations.status, "accepted"),
            ),
          );

        const holderIds = standHolders.map((holder) => holder.userId);
        if (holderIds.includes(currentUser.id)) {
          throw new VoteRejectedError("No podés votar por tu propio stand");
        }

        const [enrolledHolder] =
          holderIds.length === 0
            ? []
            : await tx
                .select({ id: festivalActivityParticipants.id })
                .from(festivalActivityParticipants)
                .where(
                  and(
                    eq(
                      festivalActivityParticipants.detailsId,
                      activityVariantId,
                    ),
                    inArray(festivalActivityParticipants.userId, holderIds),
                    isNull(festivalActivityParticipants.removedAt),
                    hasUploadedDesign(),
                  ),
                )
                .limit(1);

        if (!enrolledHolder) {
          throw new VoteRejectedError("El stand no existe");
        }
      }

      const existingVote = await tx.query.festivalActivityVotes.findFirst({
        where: and(
          eq(festivalActivityVotes.activityVariantId, activityVariantId),
          eq(festivalActivityVotes.voterId, currentUser.id),
        ),
      });

      if (existingVote) {
        throw new VoteRejectedError(
          "Ya tenés un voto registrado. No podés votar de nuevo.",
        );
      }

      await tx.insert(festivalActivityVotes).values({
        activityVariantId,
        votableType: standId !== null ? "stand" : "participant",
        standId,
        participantId,
        voterId: currentUser.id,
      });
    });
  } catch (error) {
    if (error instanceof VoteRejectedError) {
      return {
        success: false,
        message: error.message,
      };
    }

    console.error("Error adding festival activity vote", error);
    return {
      success: false,
      message: "Error al agregar el voto",
    };
  }

  revalidatePath(`/profiles/${currentUser.id}`);

  return {
    success: true,
    message: "Voto agregado correctamente",
  };
};

export async function enrollInActivity(
  forProfile: BaseProfile,
  festivalId: FestivalBase["id"],
  activityDetails: ActivityDetailsWithParticipants,
  activity: FestivalActivity,
  acceptedCategories: UserCategory[] = [],
) {
  try {
    const { id: detailsId } = activityDetails;
    const activeProfile = await fetchVerifiedActivityProfile(forProfile.id);

    if (!activeProfile) {
      return {
        success: false,
        message: inactiveParticipantMessage,
      };
    }

    // Re-fetch authoritative records from DB — do not trust caller-supplied objects
    const [[dbActivity], [dbDetails], allVariantDetails] = await Promise.all([
      db
        .select()
        .from(festivalActivities)
        .where(eq(festivalActivities.id, activity.id))
        .limit(1),
      db
        .select()
        .from(festivalActivityDetails)
        .where(eq(festivalActivityDetails.id, detailsId))
        .limit(1),
      db
        .select({ category: festivalActivityDetails.category })
        .from(festivalActivityDetails)
        .where(eq(festivalActivityDetails.activityId, activity.id)),
    ]);

    if (!dbActivity) {
      return { success: false, message: "Actividad no encontrada" };
    }

    // Best stand enrollment needs an accepted stand and allows one entry per
    // stand; only `enrollInBestStandActivity` checks either.
    if (dbActivity.type === "best_stand") {
      return {
        success: false,
        message: "No tenés permisos para inscribirte en esta actividad",
      };
    }

    if (!dbDetails || dbDetails.activityId !== dbActivity.id) {
      return { success: false, message: "Variante de actividad no encontrada" };
    }

    // Validate registration window
    if (
      DateTime.now() < DateTime.fromJSDate(dbActivity.registrationStartDate) ||
      DateTime.now() > DateTime.fromJSDate(dbActivity.registrationEndDate)
    ) {
      return {
        success: false,
        message:
          "El registro para la actividad no está disponible en este momento",
      };
    }

    // Re-derive accepted categories from DB variants — ignore acceptedCategories param
    const derivedAcceptedCategories = allVariantDetails
      .map((d) => d.category)
      .filter((c): c is UserCategory => c !== null);

    if (
      dbDetails.category !== null &&
      dbDetails.category !== activeProfile.category
    ) {
      return {
        success: false,
        message: "No tenés permisos para inscribirte en esta actividad",
      };
    }

    // A removal from any variant bars the whole activity; only staff can
    // restore a removed participant.
    if (await wasRemovedFromActivity(db, dbActivity.id, activeProfile.id)) {
      return { success: false, message: removedParticipantMessage };
    }

    const { participationLimit } = dbDetails;

    if (participationLimit && participationLimit > 0) {
      const result = await db.transaction(async (tx) => {
        const [existingInTx] = await tx
          .select({
            id: festivalActivityParticipants.id,
            removedAt: festivalActivityParticipants.removedAt,
          })
          .from(festivalActivityParticipants)
          .where(
            and(
              eq(festivalActivityParticipants.detailsId, detailsId),
              eq(festivalActivityParticipants.userId, activeProfile.id),
            ),
          );

        if (existingInTx) {
          if (!existingInTx.removedAt) {
            return {
              success: false,
              message: "Ya estás inscrito en esta actividad",
            };
          }
          return { success: false, message: removedParticipantMessage };
        }

        const currentParticipantsCount = await tx
          .select({ count: count() })
          .from(festivalActivityParticipants)
          .where(
            and(
              eq(festivalActivityParticipants.detailsId, detailsId),
              isNull(festivalActivityParticipants.removedAt),
            ),
          );

        if (currentParticipantsCount[0].count >= participationLimit) {
          return { success: false, message: "Ya no hay cupo disponible" };
        }

        // Secondary guard: for waitlist-enabled activities, freed slots (active < limit
        // but total >= limit) are reserved for invited waitlist users only.
        if (dbActivity.waitlistWindowMinutes) {
          const [{ totalCount }] = await tx
            .select({ totalCount: count() })
            .from(festivalActivityParticipants)
            .where(eq(festivalActivityParticipants.detailsId, detailsId));

          if (totalCount >= participationLimit) {
            const now = new Date();
            const [waitlistEntry] = await tx
              .select({ id: festivalActivityWaitlist.id })
              .from(festivalActivityWaitlist)
              .where(
                and(
                  eq(festivalActivityWaitlist.activityId, dbActivity.id),
                  eq(festivalActivityWaitlist.userId, activeProfile.id),
                  isNotNull(festivalActivityWaitlist.notifiedAt),
                  eq(festivalActivityWaitlist.notifiedForDetailId, detailsId),
                  gt(festivalActivityWaitlist.expiresAt, now),
                ),
              )
              .limit(1);

            if (!waitlistEntry) {
              return {
                success: false,
                message:
                  "Este cupo está reservado para participantes en la lista de espera",
              };
            }
          }
        }

        const [newParticipant] = await tx
          .insert(festivalActivityParticipants)
          .values({ userId: activeProfile.id, detailsId })
          .returning({ id: festivalActivityParticipants.id });

        return {
          success: true,
          message: "Inscripción realizada correctamente",
          participationId: newParticipant.id,
        };
      });

      if (!result.success) {
        return result;
      }

      await notifyAdminsOfEnrollment({
        festivalId,
        activityName: dbActivity.name,
        userDisplayName: activeProfile.displayName,
      });

      revalidatePath(
        `/profiles/${activeProfile.id}/festivals/${festivalId}/activity`,
      );
      return result;
    } else {
      const result = await db.transaction(async (tx) => {
        const [existingInTx] = await tx
          .select({ id: festivalActivityParticipants.id })
          .from(festivalActivityParticipants)
          .where(
            and(
              eq(festivalActivityParticipants.detailsId, detailsId),
              eq(festivalActivityParticipants.userId, activeProfile.id),
            ),
          );

        if (existingInTx) {
          return {
            success: false,
            message: "Ya estás inscrito en esta actividad",
          };
        }

        const [newParticipant] = await tx
          .insert(festivalActivityParticipants)
          .values({ userId: activeProfile.id, detailsId })
          .returning({ id: festivalActivityParticipants.id });

        return {
          success: true,
          message: "Inscripción realizada correctamente",
          participationId: newParticipant.id,
        };
      });

      if (!result.success) {
        return result;
      }

      await notifyAdminsOfEnrollment({
        festivalId,
        activityName: dbActivity.name,
        userDisplayName: activeProfile.displayName,
      });

      revalidatePath(
        `/profiles/${activeProfile.id}/festivals/${festivalId}/activity`,
      );
      return result;
    }
  } catch (error: unknown) {
    console.error("Error enrolling in activity", error);
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code: string }).code === "string"
        ? (error as { code: string }).code
        : "";
    if (code === "23505") {
      return {
        success: false,
        message: "Ya estás inscrito en esta actividad",
      };
    }
    return { success: false, message: "Error al inscribirse en la actividad" };
  }
}

export async function enrollInBestStandActivity(
  activityId: number,
  forProfileId: BaseProfile["id"],
  festivalId: FestivalBase["id"],
  _profileCategory: BaseProfile["category"],
) {
  try {
    const activeProfile = await fetchVerifiedActivityProfile(forProfileId);

    if (!activeProfile) {
      return {
        success: false,
        message: inactiveParticipantMessage,
      };
    }

    const enrollmentResult = await db.transaction(async (tx) => {
      const [participantReservation] = await tx
        .select({
          standId: standReservations.standId,
          standLabel: stands.label,
          standNumber: stands.standNumber,
        })
        .from(reservationParticipants)
        .innerJoin(
          standReservations,
          eq(standReservations.id, reservationParticipants.reservationId),
        )
        .innerJoin(stands, eq(stands.id, standReservations.standId))
        .where(
          and(
            eq(reservationParticipants.userId, forProfileId),
            eq(standReservations.festivalId, festivalId),
            eq(standReservations.status, "accepted"),
          ),
        )
        .limit(1);

      if (!participantReservation) {
        return {
          success: false,
          message: "No tenés permisos para inscribirte en esta actividad",
        };
      }

      const variantResult = await tx.execute(
        sql`
					SELECT
						${festivalActivityDetails.id} AS "variantId",
						${festivalActivities.registrationStartDate} AS "registrationStartDate",
						${festivalActivities.registrationEndDate} AS "registrationEndDate"
					FROM ${festivalActivityDetails}
					INNER JOIN ${festivalActivities}
						ON ${festivalActivities.id} = ${festivalActivityDetails.activityId}
					WHERE ${festivalActivityDetails.activityId} = ${activityId}
						AND ${festivalActivityDetails.category} = ${activeProfile.category}
						AND ${festivalActivities.festivalId} = ${festivalId}
						AND ${festivalActivities.type} = 'best_stand'
					LIMIT 1
					FOR UPDATE
				`,
      );

      const variant = variantResult.rows[0] as
        | {
            variantId: number;
            registrationStartDate: Date;
            registrationEndDate: Date;
          }
        | undefined;

      if (!variant) {
        return {
          success: false,
          message: "No pudimos registrarte en la actividad.",
        };
      }

      if (
        DateTime.now() < DateTime.fromJSDate(variant.registrationStartDate) ||
        DateTime.now() > DateTime.fromJSDate(variant.registrationEndDate)
      ) {
        return {
          success: false,
          message:
            "El registro para la actividad no está disponible en este momento",
        };
      }

      if (await wasRemovedFromActivity(tx, activityId, forProfileId)) {
        return { success: false, message: removedParticipantMessage };
      }

      const [alreadyEnrolled] = await tx
        .select({ id: festivalActivityParticipants.id })
        .from(festivalActivityParticipants)
        .where(
          and(
            eq(festivalActivityParticipants.detailsId, variant.variantId),
            eq(festivalActivityParticipants.userId, forProfileId),
          ),
        )
        .limit(1);

      if (alreadyEnrolled) {
        return {
          success: false,
          message: "Ya estás inscrito en esta actividad",
        };
      }

      const [standAlreadyRegistered] = await tx
        .select({ userId: festivalActivityParticipants.userId })
        .from(festivalActivityParticipants)
        .innerJoin(
          reservationParticipants,
          eq(
            reservationParticipants.userId,
            festivalActivityParticipants.userId,
          ),
        )
        .innerJoin(
          standReservations,
          eq(standReservations.id, reservationParticipants.reservationId),
        )
        .where(
          and(
            eq(festivalActivityParticipants.detailsId, variant.variantId),
            eq(standReservations.festivalId, festivalId),
            eq(standReservations.status, "accepted"),
            eq(standReservations.standId, participantReservation.standId),
            ne(festivalActivityParticipants.userId, forProfileId),
          ),
        )
        .limit(1);

      if (standAlreadyRegistered) {
        return {
          success: false,
          message: `Otro participante ya registró el stand ${participantReservation.standLabel}${participantReservation.standNumber}`,
        };
      }

      const insertedParticipation = await tx
        .insert(festivalActivityParticipants)
        .values({
          userId: forProfileId,
          detailsId: variant.variantId,
        })
        .onConflictDoNothing()
        .returning({ id: festivalActivityParticipants.id });

      if (insertedParticipation.length === 0) {
        return {
          success: false,
          message: "Ya estás inscrito en esta actividad",
        };
      }

      return { success: true };
    });

    if (!enrollmentResult.success) {
      return enrollmentResult;
    }
  } catch (error) {
    console.error("Error enrolling in best stand activity", error);
    return { success: false, message: "Error al inscribirte en la actividad" };
  }

  revalidatePath(`/profiles/${forProfileId}/festivals/${festivalId}/activity`);
  return {
    success: true,
    message: "Inscripción realizada correctamente",
  };
}

export async function addFestivalActivityParticipantProof(
  participationId: number,
  uploads: SignedActivityProofUpload[],
  forProfileId: number,
) {
  const activeProfile = await fetchVerifiedActivityProfile(forProfileId);

  if (!activeProfile) {
    return {
      success: false,
      message: inactiveParticipantMessage,
    };
  }

  // Deleting a proof deletes the file its row points at, so a row may only
  // point at an UploadThing file the caller uploaded through the proof route.
  // Every upload URL is public, so without the receipt a participant could aim
  // a proof at someone else's file and delete it with the proof.
  const uploadList = Array.isArray(uploads) ? uploads : [];
  const urls: string[] = [];
  for (const upload of uploadList) {
    const imageUrl = upload?.imageUrl;
    if (
      typeof imageUrl !== "string" ||
      !verifyUploadReceipt({
        route: "festivalActivityParticipantProof",
        uploaderId: activeProfile.clerkId,
        imageUrl,
        receipt: upload?.receipt,
      })
    ) {
      return {
        success: false,
        message: "No pudimos verificar la imagen. Subila de nuevo.",
      };
    }
    urls.push(imageUrl);
  }

  const participation = await db.query.festivalActivityParticipants.findFirst({
    where: and(
      eq(festivalActivityParticipants.id, participationId),
      eq(festivalActivityParticipants.userId, activeProfile.id),
      isNull(festivalActivityParticipants.removedAt),
    ),
    with: {
      activityDetail: {
        with: { festivalActivity: true },
      },
    },
  });

  if (!participation) {
    return {
      success: false,
      message: "No tenés permiso para subir diseños a esta inscripción",
    };
  }

  const activity = participation.activityDetail?.festivalActivity;
  const proofType = activity?.proofType ?? null;
  const proofUploadLimitDate = activity?.proofUploadLimitDate ?? null;

  if (proofUploadLimitDate && new Date() > new Date(proofUploadLimitDate)) {
    return {
      success: false,
      message: activity?.type
        ? getProofUploadExpiredMessage(activity.type)
        : "El período de subida ha finalizado",
    };
  }

  if (proofType === null) {
    return {
      success: false,
      message: "No es necesario subir una imagen para esta actividad",
    };
  }

  if (proofType === "text") {
    return {
      success: false,
      message:
        "Esta actividad requiere el texto de promoción; usa el formulario de cuponera.",
    };
  }

  if (proofType === "image" || proofType === "both") {
    if (urls.length === 0) {
      return {
        success: false,
        message: "Debes subir al menos una imagen para esta actividad.",
      };
    }
  }

  try {
    await db.insert(festivalActivityParticipantProofs).values(
      urls.map((url) => ({
        participationId,
        imageUrl: url,
      })),
    );
  } catch (error) {
    console.error("Error adding festival activity participant proof", error);
    return { success: false, message: "Error al subir el diseño" };
  }

  revalidatePath("/my_profile");
  revalidatePath("/my_participations");
  return { success: true, message: "Diseño subido correctamente" };
}

export async function deleteFestivalActivityParticipantProof(
  proofId: number,
  activityParticipationId: number,
  forProfileId: BaseProfile["id"],
  festivalId: FestivalBase["id"],
) {
  try {
    const activeProfile = await fetchVerifiedActivityProfile(forProfileId);

    if (!activeProfile) {
      return {
        success: false,
        message: inactiveParticipantMessage,
      };
    }

    const participation = await db.query.festivalActivityParticipants.findFirst(
      {
        where: and(
          eq(festivalActivityParticipants.id, activityParticipationId),
          eq(festivalActivityParticipants.userId, activeProfile.id),
          isNull(festivalActivityParticipants.removedAt),
        ),
        with: {
          activityDetail: {
            with: { festivalActivity: true },
          },
        },
      },
    );

    if (!participation) {
      return {
        success: false,
        message: "No tenés permiso para eliminar este diseño",
      };
    }

    const participationFestivalId =
      participation.activityDetail?.festivalActivity?.festivalId;
    if (participationFestivalId !== festivalId) {
      return {
        success: false,
        message: "No tenés permiso para eliminar este diseño",
      };
    }

    const proof = await db.query.festivalActivityParticipantProofs.findFirst({
      where: and(
        eq(festivalActivityParticipantProofs.id, proofId),
        eq(
          festivalActivityParticipantProofs.participationId,
          activityParticipationId,
        ),
      ),
    });

    if (!proof) {
      return { success: false, message: "Diseño no encontrado" };
    }

    // Removing to upload a replacement must respect the upload window: once the
    // deadline passes the design is frozen, mirroring the upload action's guard.
    const activity = participation.activityDetail?.festivalActivity;
    const proofUploadLimitDate = activity?.proofUploadLimitDate ?? null;
    if (proofUploadLimitDate && new Date() > new Date(proofUploadLimitDate)) {
      return {
        success: false,
        message: activity?.type
          ? getProofUploadExpiredMessage(activity.type)
          : "El período de subida ha finalizado",
      };
    }

    // Only proofs that have not yet been approved may be removed. An approved
    // proof is locked so a participant cannot silently undo their confirmation.
    if (
      proof.proofStatus !== "pending_review" &&
      proof.proofStatus !== "rejected_resubmit"
    ) {
      return {
        success: false,
        message: "Este diseño ya fue aprobado y no se puede eliminar",
      };
    }

    // Delete the proof row and, when it has an image, enqueue a durable storage
    // cleanup job in the same transaction. The orphaned UploadThing file is then
    // removed after commit (with cron retry) instead of a synchronous delete
    // whose failure would block the user from removing/replacing their design.
    let cleanupJobId: number | undefined;

    await db.transaction(async (tx) => {
      const deletedProofs = await tx
        .delete(festivalActivityParticipantProofs)
        .where(
          and(
            eq(festivalActivityParticipantProofs.id, proofId),
            eq(
              festivalActivityParticipantProofs.participationId,
              activityParticipationId,
            ),
            inArray(festivalActivityParticipantProofs.proofStatus, [
              "pending_review",
              "rejected_resubmit",
            ]),
          ),
        )
        .returning({ id: festivalActivityParticipantProofs.id });

      if (deletedProofs.length === 0) {
        throw new Error(PROOF_STATUS_CHANGED);
      }

      // imageUrl is null for text-only proofs — nothing to clean up in storage.
      if (proof.imageUrl) {
        const cleanupJob = await enqueueStorageCleanupJob(
          {
            entityType: "activity_proof",
            entityId: activityParticipationId,
            fileUrl: proof.imageUrl,
          },
          tx,
        );
        cleanupJobId = cleanupJob.id;
      }
    });

    if (cleanupJobId !== undefined) {
      // The proof row is already committed as deleted; a failed immediate cleanup
      // attempt must not fail the request. The job stays persisted for cron retry.
      const cleanupJobIdToAttempt = cleanupJobId;
      after(async () => {
        try {
          await attemptStorageCleanupJob(cleanupJobIdToAttempt, {
            proofId,
            activityParticipationId,
          });
        } catch (cleanupError) {
          console.error("Immediate storage cleanup attempt failed", {
            cleanupJobId: cleanupJobIdToAttempt,
            proofId,
            error: cleanupError,
          });
        }
      });
    }
  } catch (error) {
    if (error instanceof Error && error.message === PROOF_STATUS_CHANGED) {
      return {
        success: false,
        message: "Este diseño ya fue aprobado y no se puede eliminar",
      };
    }

    console.error("Error deleting festival activity participant proof", error);
    return { success: false, message: "Error al eliminar el diseño" };
  }

  revalidatePath(`/profiles/${forProfileId}/festivals/${festivalId}/activity`);
  return { success: true, message: "Diseño eliminado correctamente" };
}

export async function joinActivityWaitlist(
  forProfile: BaseProfile,
  activityId: number,
) {
  try {
    const activeProfile = await fetchVerifiedActivityProfile(forProfile.id);

    if (!activeProfile) {
      return {
        success: false,
        message: inactiveParticipantMessage,
      };
    }

    const activity = await db.query.festivalActivities.findFirst({
      where: eq(festivalActivities.id, activityId),
      with: {
        details: {
          with: {
            participants: true,
          },
        },
      },
    });

    if (!activity) {
      return { success: false, message: "La actividad no existe" };
    }

    // Best stand enrollment goes only through `enrollInBestStandActivity`,
    // which checks the accepted stand; its page offers no waitlist.
    if (activity.type === "best_stand") {
      return {
        success: false,
        message: "No tenés permisos para inscribirte en esta actividad",
      };
    }

    if (!activity.waitlistWindowMinutes) {
      return {
        success: false,
        message: "Esta actividad no tiene lista de espera habilitada",
      };
    }

    // Check user is not already actively enrolled in any variant
    const isEnrolled = activity.details.some((detail) => {
      const activeParticipants = detail.participants.filter(
        (p) => p.removedAt === null,
      );
      return activeParticipants.some((p) => p.userId === activeProfile.id);
    });
    if (isEnrolled) {
      return { success: false, message: "Ya estás inscrito en esta actividad" };
    }

    // A removal from any variant bars the whole activity, as in
    // `enrollInActivity`; only staff can restore a removed participant.
    const wasRemoved = activity.details.some((detail) =>
      detail.participants.some(
        (p) => p.userId === activeProfile.id && p.removedAt !== null,
      ),
    );
    if (wasRemoved) {
      return { success: false, message: removedParticipantMessage };
    }

    // Check all limited variants the profile can join are actually full
    const eligibleDetails = activity.details.filter(
      (detail) =>
        detail.category === null || detail.category === activeProfile.category,
    );
    const allFull = eligibleDetails.every((detail) => {
      const activeParticipants = detail.participants.filter(
        (p) => p.removedAt === null,
      );
      return (
        detail.participationLimit !== null &&
        detail.participationLimit !== undefined &&
        activeParticipants.length >= detail.participationLimit
      );
    });
    if (!allFull) {
      return {
        success: false,
        message: "Todavía hay cupos disponibles en esta actividad",
      };
    }

    const maxInsertAttempts = 3;
    for (let attempt = 1; attempt <= maxInsertAttempts; attempt++) {
      const result = await db.transaction(async (tx) => {
        // Verify not already on waitlist
        const [existing] = await tx
          .select({ id: festivalActivityWaitlist.id })
          .from(festivalActivityWaitlist)
          .where(
            and(
              eq(festivalActivityWaitlist.activityId, activityId),
              eq(festivalActivityWaitlist.userId, activeProfile.id),
            ),
          );

        if (existing) {
          return {
            success: false as const,
            message: "Ya estás en la lista de espera de esta actividad",
            retry: false as const,
          };
        }

        // Serialize position assignment for each activity within this tx.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${activityId})`);

        const [maxRow] = await tx
          .select({
            maxPos: sql<number>`coalesce(max(${festivalActivityWaitlist.position}), 0)`,
          })
          .from(festivalActivityWaitlist)
          .where(eq(festivalActivityWaitlist.activityId, activityId));

        const position = (maxRow?.maxPos ?? 0) + 1;

        const inserted = await tx
          .insert(festivalActivityWaitlist)
          .values({
            activityId,
            userId: activeProfile.id,
            position,
          })
          .onConflictDoNothing()
          .returning({ id: festivalActivityWaitlist.id });

        if (inserted.length === 0) {
          const [nowExisting] = await tx
            .select({ id: festivalActivityWaitlist.id })
            .from(festivalActivityWaitlist)
            .where(
              and(
                eq(festivalActivityWaitlist.activityId, activityId),
                eq(festivalActivityWaitlist.userId, activeProfile.id),
              ),
            );

          if (nowExisting) {
            return {
              success: false as const,
              message: "Ya estás en la lista de espera de esta actividad",
              retry: false as const,
            };
          }

          return {
            success: false as const,
            message: "Conflicto al asignar posición en lista de espera",
            retry: true as const,
          };
        }

        return {
          success: true as const,
          message: "Te uniste a la lista de espera",
          position,
          retry: false as const,
        };
      });

      if (result.success || !result.retry) {
        if (result.success) {
          revalidatePath(`/profiles/${activeProfile.id}`);
          return {
            success: true,
            message: result.message,
            position: result.position,
          };
        }

        return { success: false, message: result.message };
      }
    }

    return {
      success: false,
      message: "Error al unirse a la lista de espera",
    };
  } catch (error) {
    console.error("Error joining activity waitlist", error);
    return { success: false, message: "Error al unirse a la lista de espera" };
  }
}

export async function leaveActivityWaitlist(
  userId: number,
  activityId: number,
) {
  // The owner leaves; an admin can also act from the owner's profile pages,
  // which `protectRoute` opens to admins.
  const actor = await requireProfileOwnerOrAdmin(userId);
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  try {
    await db
      .delete(festivalActivityWaitlist)
      .where(
        and(
          eq(festivalActivityWaitlist.activityId, activityId),
          eq(festivalActivityWaitlist.userId, userId),
        ),
      );

    revalidatePath(`/profiles/${userId}`);
    return { success: true, message: "Saliste de la lista de espera" };
  } catch (error) {
    console.error("Error leaving activity waitlist", error);
    return {
      success: false,
      message: "Error al salir de la lista de espera",
    };
  }
}

export async function enrollFromWaitlistInvitation(
  userId: number,
  waitlistEntryId: number,
  festivalId: number,
) {
  try {
    const activeProfile = await fetchVerifiedActivityProfile(userId);

    if (!activeProfile) {
      return {
        success: false,
        message: inactiveParticipantMessage,
      };
    }

    const [entry] = await db
      .select()
      .from(festivalActivityWaitlist)
      .where(
        and(
          eq(festivalActivityWaitlist.id, waitlistEntryId),
          eq(festivalActivityWaitlist.userId, userId),
        ),
      );

    if (!entry) {
      return {
        success: false,
        message: "Entrada de lista de espera no encontrada",
      };
    }

    const invitationExpired = entry.expiresAt
      ? new Date(entry.expiresAt).getTime() <= Date.now()
      : false;

    if (!entry.notifiedAt || !entry.notifiedForDetailId || invitationExpired) {
      return {
        success: false,
        message: "No tenés una invitación activa para inscribirte",
      };
    }

    const [detail] = await db
      .select({
        id: festivalActivityDetails.id,
        participationLimit: festivalActivityDetails.participationLimit,
        activityType: festivalActivities.type,
      })
      .from(festivalActivityDetails)
      .innerJoin(
        festivalActivities,
        eq(festivalActivities.id, festivalActivityDetails.activityId),
      )
      .where(eq(festivalActivityDetails.id, entry.notifiedForDetailId));

    if (!detail) {
      return { success: false, message: "La variante de actividad no existe" };
    }

    // Same as `joinActivityWaitlist`: best stand enrollment needs the checks
    // only `enrollInBestStandActivity` makes.
    if (detail.activityType === "best_stand") {
      return {
        success: false,
        message: "No tenés permisos para inscribirte en esta actividad",
      };
    }

    await db.transaction(async (tx) => {
      const ensureCapacityAvailable = async () => {
        if (!detail.participationLimit) return;
        const now = new Date();
        const [{ activeCount }] = await tx
          .select({ activeCount: count() })
          .from(festivalActivityParticipants)
          .where(
            and(
              eq(
                festivalActivityParticipants.detailsId,
                entry.notifiedForDetailId!,
              ),
              isNull(festivalActivityParticipants.removedAt),
            ),
          );
        const [{ reservedCount }] = await tx
          .select({ reservedCount: count() })
          .from(festivalActivityWaitlist)
          .where(
            and(
              eq(
                festivalActivityWaitlist.notifiedForDetailId,
                entry.notifiedForDetailId!,
              ),
              gt(festivalActivityWaitlist.expiresAt, now),
              ne(festivalActivityWaitlist.id, waitlistEntryId),
            ),
          );
        const combinedCount = activeCount + reservedCount;
        if (combinedCount >= detail.participationLimit) {
          throw new Error("El cupo ya no está disponible");
        }
      };

      // Check for existing (possibly soft-deleted) participant row
      const [existing] = await tx
        .select({
          id: festivalActivityParticipants.id,
          removedAt: festivalActivityParticipants.removedAt,
        })
        .from(festivalActivityParticipants)
        .where(
          and(
            eq(
              festivalActivityParticipants.detailsId,
              entry.notifiedForDetailId!,
            ),
            eq(festivalActivityParticipants.userId, userId),
          ),
        );

      // Accepting an invitation must not undo a removal from any variant of
      // the activity; only staff can restore a removed participant.
      if (existing) {
        throw new Error(
          existing.removedAt
            ? removedParticipantMessage
            : "Ya estás inscrito en esta actividad",
        );
      }
      if (await wasRemovedFromActivity(tx, entry.activityId, userId)) {
        throw new Error(removedParticipantMessage);
      }

      // Verify capacity one more time
      await ensureCapacityAvailable();
      await tx.insert(festivalActivityParticipants).values({
        userId,
        detailsId: entry.notifiedForDetailId!,
      });

      await tx
        .delete(festivalActivityWaitlist)
        .where(eq(festivalActivityWaitlist.id, waitlistEntryId));
    });

    revalidatePath(
      `/profiles/${activeProfile.id}/festivals/${festivalId}/activity`,
    );
    return { success: true, message: "Inscripción realizada correctamente" };
  } catch (error) {
    console.error("Error enrolling from waitlist invitation", error);
    if (error instanceof Error) {
      return { success: false, message: error.message };
    }
    return {
      success: false,
      message: "Error al inscribirse desde la lista de espera",
    };
  }
}

/**
 * Coupon-book preview data for one participation, for its owner's proof form.
 * Staff may read any participation's.
 */
export async function fetchParticipationPreviewData(
  participationId: number,
): Promise<ParticipationPreviewData | null> {
  const viewer = await getCurrentUserProfile();
  if (!viewer) return null;

  const isStaff = viewer.role === "admin" || viewer.role === "festival_admin";
  if (!isStaff) {
    const ownerId = await fetchActivityParticipationOwnerId(participationId);
    if (ownerId !== viewer.id) return null;
  }

  const batchData = await fetchParticipationPreviewDataBatch([participationId]);
  return batchData[participationId] ?? null;
}
