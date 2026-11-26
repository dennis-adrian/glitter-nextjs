"use server";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import {
  REQUIRED_PROOF_TYPE_MESSAGE,
  getRequiredProofType,
} from "@/app/lib/festival_activites/helpers";
import {
  ActivityUserCategory,
  ProofStatus,
  ProofType,
} from "@/app/lib/festival_activites/types";
import { db } from "@/db";
import {
  festivalActivities,
  festivalActivityDetails,
  festivalActivityParticipantProofs,
  festivalActivityParticipants,
  festivalActivityWaitlist,
  festivals,
  users,
} from "@/db/schema";
import { and, asc, count, eq, gt, isNull, lte, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/app/vendors/resend";
import { assertSent } from "@/app/vendors/resend-result";
import ActivityProofReviewEmail from "@/app/emails/activity-proof-review";
import ActivityWaitlistInvitationEmail from "@/app/emails/activity-waitlist-invitation";
import { promoteFromWaitlist } from "@/app/lib/festival_activites/waitlist-promotion";
import { wasRemovedFromActivity } from "@/app/lib/festival_activites/queries";
import { validateCouponBookHeaderImageInput } from "@/app/lib/festival_activites/coupon-book-header-image";
import {
  getMaterialConfig,
  getProofUploadExpiredMessage,
} from "@/app/lib/festival_activites/helpers";
import React from "react";

export type FestivalActivityDetailInput = {
  /** Present for existing details, absent for new ones */
  id?: number;
  description?: string;
  participationLimit?: number;
  category?: ActivityUserCategory | null;
  imageUrl?: string;
  couponBookHeaderImageUrl?: string;
};

export type FestivalActivityInput = {
  name: string;
  description?: string;
  visitorsDescription?: string;
  type:
    | "stamp_passport"
    | "sticker_print"
    | "best_stand"
    | "festival_sticker"
    | "coupon_book"
    | "sticker_hunt"
    | "stamp_card";
  accessLevel: "public" | "festival_participants_only";
  promotionalArtUrl?: string;
  activityPrizeUrl?: string;
  registrationStartDate: Date;
  registrationEndDate: Date;
  proofType?: ProofType | null;
  proofUploadLimitDate?: Date;
  allowsVoting: boolean;
  votingStartDate?: Date;
  votingEndDate?: Date;
  waitlistWindowMinutes?: number | null;
  details: FestivalActivityDetailInput[];
};

async function getAdminProfile() {
  const profile = await getCurrentUserProfile();
  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "festival_admin")
  ) {
    return null;
  }
  return profile;
}

const PROOF_LIMIT_REQUIRED_MESSAGE =
  "Si la actividad exige prueba, debes indicar la fecha límite para cargar la prueba.";

function proofValidationMessage(data: FestivalActivityInput): string | null {
  const requiredProofType = getRequiredProofType(data.type);
  if (requiredProofType && data.proofType !== requiredProofType) {
    return REQUIRED_PROOF_TYPE_MESSAGE;
  }
  if ((data.proofType ?? null) === null) {
    return null;
  }
  const d = data.proofUploadLimitDate;
  if (d == null || Number.isNaN(d.getTime())) {
    return PROOF_LIMIT_REQUIRED_MESSAGE;
  }
  return null;
}

function normalizeCouponBookHeaderImages(data: FestivalActivityInput):
  | {
      ok: true;
      details: FestivalActivityDetailInput[];
    }
  | {
      ok: false;
      message: string;
    } {
  const details: FestivalActivityDetailInput[] = [];

  for (const [index, detail] of data.details.entries()) {
    if (data.type !== "coupon_book") {
      details.push({
        ...detail,
        couponBookHeaderImageUrl: undefined,
      });
      continue;
    }

    const validated = validateCouponBookHeaderImageInput(
      detail.couponBookHeaderImageUrl,
    );
    if (!validated.ok) {
      return {
        ok: false,
        message: `Variante ${index + 1}: ${validated.error}`,
      };
    }

    details.push({
      ...detail,
      couponBookHeaderImageUrl: validated.value ?? undefined,
    });
  }

  return { ok: true, details };
}

export async function createFestivalActivity(
  festivalId: number,
  data: FestivalActivityInput,
): Promise<{ success: boolean; message: string; activityId?: number }> {
  const profile = await getAdminProfile();
  if (!profile) {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción",
    };
  }

  if (data.details.length === 0) {
    return {
      success: false,
      message: "La actividad debe tener al menos una variante",
    };
  }

  const proofLimitMsg = proofValidationMessage(data);
  if (proofLimitMsg) {
    return { success: false, message: proofLimitMsg };
  }

  const normalizedHeaderImages = normalizeCouponBookHeaderImages(data);
  if (!normalizedHeaderImages.ok) {
    return { success: false, message: normalizedHeaderImages.message };
  }
  const detailsWithValidatedHeaderImage = normalizedHeaderImages.details;

  try {
    const activityId = await db.transaction(async (tx) => {
      const [activity] = await tx
        .insert(festivalActivities)
        .values({
          festivalId,
          name: data.name,
          description: data.description,
          visitorsDescription: data.visitorsDescription,
          type: data.type,
          accessLevel: data.accessLevel,
          promotionalArtUrl: data.promotionalArtUrl,
          activityPrizeUrl: data.activityPrizeUrl,
          registrationStartDate: data.registrationStartDate,
          registrationEndDate: data.registrationEndDate,
          proofType: data.proofType ?? null,
          proofUploadLimitDate: data.proofUploadLimitDate,
          allowsVoting: data.allowsVoting,
          votingStartDate: data.votingStartDate,
          votingEndDate: data.votingEndDate,
          waitlistWindowMinutes: data.waitlistWindowMinutes ?? null,
        })
        .returning({ id: festivalActivities.id });

      await tx.insert(festivalActivityDetails).values(
        detailsWithValidatedHeaderImage.map((detail) => ({
          activityId: activity.id,
          description: detail.description,
          participationLimit: detail.participationLimit,
          category: detail.category ?? null,
          imageUrl: detail.imageUrl ?? null,
          couponBookHeaderImageUrl:
            data.type === "coupon_book"
              ? (detail.couponBookHeaderImageUrl ?? null)
              : null,
        })),
      );

      return activity.id;
    });

    revalidatePath(`/dashboard/festivals/${festivalId}/festival_activities`);

    return {
      success: true,
      message: "Actividad creada correctamente",
      activityId,
    };
  } catch (error) {
    console.error("Error creating festival activity:", error);
    return { success: false, message: "Error al crear la actividad" };
  }
}

export async function updateFestivalActivity(
  activityId: number,
  festivalId: number,
  data: FestivalActivityInput,
): Promise<{ success: boolean; message: string }> {
  const profile = await getAdminProfile();
  if (!profile) {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción",
    };
  }

  if (data.details.length === 0) {
    return {
      success: false,
      message: "La actividad debe tener al menos una variante",
    };
  }

  const proofLimitMsgUpdate = proofValidationMessage(data);
  if (proofLimitMsgUpdate) {
    return { success: false, message: proofLimitMsgUpdate };
  }

  const normalizedHeaderImages = normalizeCouponBookHeaderImages(data);
  if (!normalizedHeaderImages.ok) {
    return { success: false, message: normalizedHeaderImages.message };
  }
  const detailsWithValidatedHeaderImage = normalizedHeaderImages.details;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(festivalActivities)
        .set({
          name: data.name,
          description: data.description,
          visitorsDescription: data.visitorsDescription,
          type: data.type,
          accessLevel: data.accessLevel,
          promotionalArtUrl: data.promotionalArtUrl,
          activityPrizeUrl: data.activityPrizeUrl,
          registrationStartDate: data.registrationStartDate,
          registrationEndDate: data.registrationEndDate,
          proofType: data.proofType ?? null,
          proofUploadLimitDate: data.proofUploadLimitDate,
          allowsVoting: data.allowsVoting,
          votingStartDate: data.votingStartDate,
          votingEndDate: data.votingEndDate,
          waitlistWindowMinutes: data.waitlistWindowMinutes ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(festivalActivities.id, activityId),
            eq(festivalActivities.festivalId, festivalId),
          ),
        );

      // Diff details: update existing, insert new, delete absent (if no participants)
      const existing = await tx
        .select({ id: festivalActivityDetails.id })
        .from(festivalActivityDetails)
        .where(eq(festivalActivityDetails.activityId, activityId));

      const existingIds = new Set(existing.map((d) => d.id));
      const incomingIds = new Set(
        detailsWithValidatedHeaderImage
          .filter((d) => d.id != null)
          .map((d) => d.id as number),
      );

      // Delete details no longer in the payload — abort if active participants exist
      const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
      for (const detailId of toDelete) {
        const [{ n }] = await tx
          .select({ n: count() })
          .from(festivalActivityParticipants)
          .where(
            and(
              eq(festivalActivityParticipants.detailsId, detailId),
              isNull(festivalActivityParticipants.removedAt),
            ),
          );
        if (n > 0) {
          throw new Error(
            `La variante tiene ${n} participante(s) inscripto(s) y no puede eliminarse.`,
          );
        }
        await tx
          .delete(festivalActivityDetails)
          .where(eq(festivalActivityDetails.id, detailId));
      }

      // Update existing details
      for (const detail of detailsWithValidatedHeaderImage.filter(
        (d) => d.id != null && existingIds.has(d.id),
      )) {
        await tx
          .update(festivalActivityDetails)
          .set({
            description: detail.description,
            participationLimit: detail.participationLimit ?? null,
            category: detail.category ?? null,
            imageUrl: detail.imageUrl ?? null,
            couponBookHeaderImageUrl:
              data.type === "coupon_book"
                ? (detail.couponBookHeaderImageUrl ?? null)
                : null,
          })
          .where(eq(festivalActivityDetails.id, detail.id as number));
      }

      // Insert new details
      const newDetails = detailsWithValidatedHeaderImage.filter(
        (d) => d.id == null,
      );
      if (newDetails.length > 0) {
        await tx.insert(festivalActivityDetails).values(
          newDetails.map((detail) => ({
            activityId,
            description: detail.description,
            participationLimit: detail.participationLimit,
            category: detail.category ?? null,
            imageUrl: detail.imageUrl ?? null,
            couponBookHeaderImageUrl:
              data.type === "coupon_book"
                ? (detail.couponBookHeaderImageUrl ?? null)
                : null,
          })),
        );
      }
    });

    revalidatePath(`/dashboard/festivals/${festivalId}/festival_activities`);

    return { success: true, message: "Actividad actualizada correctamente" };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error al actualizar la actividad";
    console.error("Error updating festival activity:", error);
    return { success: false, message };
  }
}

export async function upsertActivityParticipantProof(
  participationId: number,
  data: {
    promoHighlight?: string;
    promoDescription: string;
    promoConditions?: string;
  },
): Promise<{ success: boolean; message: string }> {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    return { success: false, message: "No tienes permisos para esta acción" };
  }

  if (profile.status !== "verified") {
    return {
      success: false,
      message:
        "Tu perfil debe estar verificado y activo para actualizar esta prueba.",
    };
  }

  if (data.promoHighlight && data.promoHighlight.trim().length > 20) {
    return {
      success: false,
      message: "El destacado no puede superar los 20 caracteres",
    };
  }

  if (data.promoConditions && data.promoConditions.trim().length > 80) {
    return {
      success: false,
      message: "Las condiciones no pueden superar los 80 caracteres",
    };
  }

  try {
    // Verify ownership and load activity proofType (PRD: promo text for text/both)
    const participation = await db.query.festivalActivityParticipants.findFirst(
      {
        where: and(
          eq(festivalActivityParticipants.id, participationId),
          eq(festivalActivityParticipants.userId, profile.id),
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
        message: "No se encontró la inscripción o no tienes permisos",
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
        message: "Esta actividad no requiere prueba por texto.",
      };
    }

    if (proofType === "image") {
      return {
        success: false,
        message:
          "Esta actividad solo admite prueba por imagen; sube tu diseño en el formulario de carga de imágenes.",
      };
    }

    const promoTrimmed = data.promoDescription.trim();
    if (
      (proofType === "text" || proofType === "both") &&
      promoTrimmed.length === 0
    ) {
      return {
        success: false,
        message: "Debes indicar la descripción de tu promoción.",
      };
    }

    if (promoTrimmed.length > 30) {
      return {
        success: false,
        message: "La promoción no puede superar los 30 caracteres",
      };
    }

    const existingProof =
      await db.query.festivalActivityParticipantProofs.findFirst({
        where: and(
          eq(
            festivalActivityParticipantProofs.participationId,
            participationId,
          ),
          // Text proofs do not have an image URL attached.
          isNull(festivalActivityParticipantProofs.imageUrl),
        ),
      });

    if (existingProof?.proofStatus === "rejected_removed") {
      return {
        success: false,
        message: "Tu participación fue removida y no puedes reenviar",
      };
    }

    const promoHighlight = data.promoHighlight?.trim() || null;

    if (existingProof) {
      await db
        .update(festivalActivityParticipantProofs)
        .set({
          promoHighlight,
          promoDescription: promoTrimmed,
          promoConditions: data.promoConditions ?? null,
          proofStatus: "pending_review",
          adminFeedback: null,
          updatedAt: new Date(),
        })
        .where(eq(festivalActivityParticipantProofs.id, existingProof.id));
    } else {
      await db.insert(festivalActivityParticipantProofs).values({
        participationId,
        promoHighlight,
        promoDescription: promoTrimmed,
        promoConditions: data.promoConditions ?? null,
        proofStatus: "pending_review",
        adminFeedback: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    revalidatePath("/my_profile");
    return { success: true, message: "Promoción enviada correctamente" };
  } catch (error) {
    console.error("Error upserting activity participant proof:", error);
    return { success: false, message: "Error al enviar la promoción" };
  }
}

export async function reviewActivityParticipantProof(
  proofId: number,
  status: Exclude<ProofStatus, "pending_review">,
  adminFeedback?: string,
): Promise<{ success: boolean; message: string }> {
  const profile = await getAdminProfile();
  if (!profile) {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción",
    };
  }

  // PRD: adminFeedback obligatorio en rechazos (proofStatus rejected_*)
  if (
    (status === "rejected_resubmit" || status === "rejected_removed") &&
    !adminFeedback?.trim()
  ) {
    return {
      success: false,
      message: "El feedback es requerido al rechazar una prueba",
    };
  }

  const normalizedRemovalReason = adminFeedback?.trim() || null;

  try {
    let proofWasReviewed = false;
    let shouldPromoteFromWaitlist = false;

    await db.transaction(async (tx) => {
      const proof = await tx.query.festivalActivityParticipantProofs.findFirst({
        where: eq(festivalActivityParticipantProofs.id, proofId),
      });

      if (!proof) throw new Error("Prueba no encontrada");
      if (proof.proofStatus !== "pending_review") return;

      await tx
        .update(festivalActivityParticipantProofs)
        .set({
          proofStatus: status,
          adminFeedback: normalizedRemovalReason,
          updatedAt: new Date(),
        })
        .where(eq(festivalActivityParticipantProofs.id, proofId));
      proofWasReviewed = true;

      if (status === "rejected_removed") {
        await tx
          .update(festivalActivityParticipants)
          .set({
            removedAt: new Date(),
            updatedAt: new Date(),
            removalReason: normalizedRemovalReason,
          })
          .where(eq(festivalActivityParticipants.id, proof.participationId));
        shouldPromoteFromWaitlist = true;
      }
    });

    if (!proofWasReviewed) {
      return {
        success: false,
        message: "La prueba ya fue revisada anteriormente",
      };
    }

    // Send notification email — nested try/catch so failures don't affect the response
    try {
      const proofWithData =
        await db.query.festivalActivityParticipantProofs.findFirst({
          where: eq(festivalActivityParticipantProofs.id, proofId),
          with: {
            participation: {
              with: {
                user: true,
                activityDetail: {
                  with: { festivalActivity: true },
                },
              },
            },
          },
        });

      if (proofWithData?.participation?.user?.email) {
        const { user } = proofWithData.participation;
        const activity =
          proofWithData.participation.activityDetail.festivalActivity;
        const festival = await db.query.festivals.findFirst({
          where: eq(festivals.id, activity.festivalId),
        });
        if (festival) {
          const materialConfig = getMaterialConfig(activity.type);
          const subjects: Record<typeof status, string> = {
            approved: `Tu ${materialConfig.label} fue ${materialConfig.pastParticiple} - ${activity.name}`,
            rejected_resubmit: `Tu ${materialConfig.label} necesita correcciones - ${activity.name}`,
            rejected_removed: `Fuiste removido/a de la actividad - ${activity.name}`,
          };
          const result = await sendEmail({
            to: [user.email],
            from: "Equipo Glitter <equipo@productoraglitter.com>",
            subject: subjects[status],
            react: React.createElement(ActivityProofReviewEmail, {
              profile: user,
              festivalId: activity.festivalId,
              activityId: activity.id,
              activityName: activity.name,
              festivalName: festival.name,
              festivalType: festival.festivalType,
              status,
              adminFeedback,
              materialLabel: materialConfig.label,
              materialArticle: materialConfig.article,
              materialPastParticiple: materialConfig.pastParticiple,
            }),
          });
          assertSent(result);
        }
      }
    } catch (emailError) {
      console.error(
        "Error sending proof review notification email:",
        emailError,
      );
    }

    // When a participant is removed, promote the next person from the waitlist
    if (shouldPromoteFromWaitlist) {
      try {
        const proofForWaitlist =
          await db.query.festivalActivityParticipantProofs.findFirst({
            where: eq(festivalActivityParticipantProofs.id, proofId),
            with: {
              participation: {
                with: {
                  activityDetail: true,
                },
              },
            },
          });
        const detail = proofForWaitlist?.participation?.activityDetail;
        if (detail) {
          await promoteFromWaitlist(detail.activityId, detail.id);
        }
      } catch (waitlistError) {
        console.error("Error promoting from waitlist:", waitlistError);
      }
    }

    revalidatePath("/dashboard");
    return { success: true, message: "Prueba revisada correctamente" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al revisar la prueba";
    console.error("Error reviewing activity participant proof:", error);
    return { success: false, message };
  }
}

export async function removeActivityParticipant(
  participationId: number,
  reason: string,
): Promise<{ success: boolean; message: string }> {
  const profile = await getAdminProfile();
  if (!profile) {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción",
    };
  }

  if (!reason.trim()) {
    return { success: false, message: "El motivo de remoción es requerido" };
  }

  try {
    const participation = await db.query.festivalActivityParticipants.findFirst(
      {
        where: eq(festivalActivityParticipants.id, participationId),
        with: {
          user: true,
          activityDetail: {
            with: { festivalActivity: true },
          },
        },
      },
    );

    if (!participation) {
      return { success: false, message: "Participante no encontrado" };
    }

    if (participation.removedAt) {
      return { success: false, message: "El participante ya fue removido" };
    }

    const normalizedRemovalReason = reason.trim() || null;

    const updatedRows = await db
      .update(festivalActivityParticipants)
      .set({
        removedAt: new Date(),
        updatedAt: new Date(),
        removalReason: normalizedRemovalReason,
      })
      .where(
        and(
          eq(festivalActivityParticipants.id, participationId),
          isNull(festivalActivityParticipants.removedAt),
        ),
      )
      .returning({ id: festivalActivityParticipants.id });

    const didRemove = updatedRows.length === 1;

    if (!didRemove) {
      // Concurrent removal won the race, or row state changed — idempotent: no duplicate emails / waitlist promotion
      revalidatePath("/dashboard");
      return { success: true, message: "Participante removido correctamente" };
    }

    // Send notification email
    try {
      if (participation.user?.email) {
        const { user, activityDetail } = participation;
        const activity = activityDetail.festivalActivity;
        const festival = await db.query.festivals.findFirst({
          where: eq(festivals.id, activity.festivalId),
        });
        if (festival) {
          const materialConfig = getMaterialConfig(activity.type);
          const result = await sendEmail({
            to: [user.email],
            from: "Equipo Glitter <equipo@productoraglitter.com>",
            subject: `Fuiste removido/a de la actividad - ${activity.name}`,
            react: React.createElement(ActivityProofReviewEmail, {
              profile: user,
              festivalId: activity.festivalId,
              activityId: activity.id,
              activityName: activity.name,
              festivalName: festival.name,
              festivalType: festival.festivalType,
              status: "rejected_removed",
              adminFeedback: reason,
              materialLabel: materialConfig.label,
              materialArticle: materialConfig.article,
              materialPastParticiple: materialConfig.pastParticiple,
            }),
          });
          assertSent(result);
        }
      }
    } catch (emailError) {
      console.error("Error sending participant removal email:", emailError);
    }

    // Promote next person from waitlist
    try {
      await promoteFromWaitlist(
        participation.activityDetail.festivalActivity.id,
        participation.activityDetail.id,
      );
    } catch (waitlistError) {
      console.error("Error promoting from waitlist:", waitlistError);
    }

    revalidatePath("/dashboard");
    return { success: true, message: "Participante removido correctamente" };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error al remover al participante";
    console.error("Error removing activity participant:", error);
    return { success: false, message };
  }
}

export async function restoreActivityParticipant(
  participationId: number,
): Promise<{ success: boolean; message: string }> {
  const profile = await getAdminProfile();
  if (!profile) {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción",
    };
  }

  try {
    const participation = await db.query.festivalActivityParticipants.findFirst(
      {
        where: eq(festivalActivityParticipants.id, participationId),
        with: { activityDetail: true },
      },
    );

    if (!participation) {
      return { success: false, message: "Participante no encontrado" };
    }

    if (!participation.removedAt) {
      return { success: false, message: "El participante no está removido" };
    }

    if (participation.activityDetail.participationLimit) {
      const now = new Date();

      const [{ activeCount }] = await db
        .select({ activeCount: count() })
        .from(festivalActivityParticipants)
        .where(
          and(
            eq(festivalActivityParticipants.detailsId, participation.detailsId),
            isNull(festivalActivityParticipants.removedAt),
          ),
        );

      const [{ reservedCount }] = await db
        .select({ reservedCount: count() })
        .from(festivalActivityWaitlist)
        .where(
          and(
            eq(
              festivalActivityWaitlist.notifiedForDetailId,
              participation.detailsId,
            ),
            gt(festivalActivityWaitlist.expiresAt, now),
          ),
        );

      const combinedCount = activeCount + reservedCount;

      if (combinedCount >= participation.activityDetail.participationLimit) {
        return {
          success: false,
          message: "No hay cupos disponibles para restaurar al participante",
        };
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(festivalActivityParticipants)
        .set({
          removedAt: null,
          removalReason: null,
          updatedAt: new Date(),
        })
        .where(eq(festivalActivityParticipants.id, participationId));

      await tx
        .update(festivalActivityParticipantProofs)
        .set({
          proofStatus: "rejected_resubmit",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              festivalActivityParticipantProofs.participationId,
              participationId,
            ),
            eq(
              festivalActivityParticipantProofs.proofStatus,
              "rejected_removed",
            ),
          ),
        );
    });

    revalidatePath("/dashboard");
    return { success: true, message: "Participante restaurado correctamente" };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error al restaurar al participante";
    console.error("Error restoring activity participant:", error);
    return { success: false, message };
  }
}

/**
 * Moves an active participant to another variant of the same activity. The
 * participation row keeps its id, so proofs, review state and votes travel
 * with it. The target must have room (active participants plus outstanding
 * waitlist reservations) and accept the participant's category. When the
 * move leaves the source variant below its limit, the freed slot goes to the
 * waitlist, as with a removal; `invitedName` then names who was invited.
 *
 * `expectedSourceDetailId` is the variant the admin saw the participant in;
 * when the participant has moved meanwhile (another admin, another tab), the
 * move is refused instead of silently overriding the other one.
 *
 * `undo: true` puts a participant back where a move took them from. It
 * restores the earlier state, so it may refill an over-capacity variant
 * (unless a waitlist invitation now holds a seat there) and it invites
 * nobody to the slot it frees.
 */
export async function moveActivityParticipant(
  participationId: number,
  targetDetailId: number,
  options: { expectedSourceDetailId?: number; undo?: boolean } = {},
): Promise<{
  success: boolean;
  message: string;
  /** Set when the freed source slot went to someone on the waitlist. */
  invitedName?: string;
}> {
  const profile = await getAdminProfile();
  if (!profile) {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción",
    };
  }

  type MoveResult =
    | { success: false; message: string }
    | {
        success: true;
        message: string;
        activityId: number;
        sourceDetailId: number;
      };

  try {
    const result = await db.transaction(async (tx): Promise<MoveResult> => {
      // Lock the row on its own, without joins: a concurrent move that waits
      // on this lock then re-reads the row as the winner left it, instead of
      // losing it to a join on the old details_id.
      const [locked] = await tx
        .select({
          id: festivalActivityParticipants.id,
          userId: festivalActivityParticipants.userId,
          detailsId: festivalActivityParticipants.detailsId,
          removedAt: festivalActivityParticipants.removedAt,
        })
        .from(festivalActivityParticipants)
        .where(eq(festivalActivityParticipants.id, participationId))
        .for("update");

      if (!locked) {
        return { success: false, message: "Participante no encontrado" };
      }
      if (
        options.expectedSourceDetailId !== undefined &&
        locked.detailsId !== options.expectedSourceDetailId &&
        locked.detailsId !== targetDetailId
      ) {
        return {
          success: false,
          message:
            "El participante ya fue movido a otra variante. Actualizá la página.",
        };
      }

      const [source] = await tx
        .select({ activityId: festivalActivityDetails.activityId })
        .from(festivalActivityDetails)
        .where(eq(festivalActivityDetails.id, locked.detailsId));
      const [owner] = await tx
        .select({ category: users.category })
        .from(users)
        .where(eq(users.id, locked.userId));
      if (!source || !owner) {
        return { success: false, message: "Participante no encontrado" };
      }
      const participation = {
        ...locked,
        activityId: source.activityId,
        userCategory: owner.category,
      };
      if (participation.removedAt) {
        return {
          success: false,
          message: "Restaurá al participante antes de moverlo de variante",
        };
      }
      if (participation.detailsId === targetDetailId) {
        return {
          success: false,
          message: "El participante ya está en esa variante",
        };
      }

      // Locking the target serializes concurrent moves into it, so two moves
      // cannot both take its last slot.
      const [target] = await tx
        .select({
          id: festivalActivityDetails.id,
          participationLimit: festivalActivityDetails.participationLimit,
          category: festivalActivityDetails.category,
        })
        .from(festivalActivityDetails)
        .where(
          and(
            eq(festivalActivityDetails.id, targetDetailId),
            eq(festivalActivityDetails.activityId, participation.activityId),
          ),
        )
        .for("update");

      if (!target) {
        return {
          success: false,
          message: "La variante de destino no pertenece a esta actividad",
        };
      }

      if (target.category && participation.userCategory !== target.category) {
        return {
          success: false,
          message:
            "La categoría del participante no coincide con la de la variante de destino",
        };
      }

      const [existing] = await tx
        .select({ id: festivalActivityParticipants.id })
        .from(festivalActivityParticipants)
        .where(
          and(
            eq(festivalActivityParticipants.detailsId, targetDetailId),
            eq(festivalActivityParticipants.userId, participation.userId),
          ),
        );
      if (existing) {
        return {
          success: false,
          message: "El participante ya tiene un registro en esa variante",
        };
      }

      if (target.participationLimit) {
        const now = new Date();
        const [{ activeCount }] = await tx
          .select({ activeCount: count() })
          .from(festivalActivityParticipants)
          .where(
            and(
              eq(festivalActivityParticipants.detailsId, targetDetailId),
              isNull(festivalActivityParticipants.removedAt),
            ),
          );
        const [{ reservedCount }] = await tx
          .select({ reservedCount: count() })
          .from(festivalActivityWaitlist)
          .where(
            and(
              eq(festivalActivityWaitlist.notifiedForDetailId, targetDetailId),
              gt(festivalActivityWaitlist.expiresAt, now),
            ),
          );
        const full = activeCount + reservedCount >= target.participationLimit;
        // An undo may return to an over-capacity variant the admin had left
        // that way, but never take a seat an invitation now holds.
        if (options.undo ? reservedCount > 0 && full : full) {
          return {
            success: false,
            message: "La variante de destino no tiene cupos disponibles",
          };
        }
      }

      await tx
        .update(festivalActivityParticipants)
        .set({ detailsId: targetDetailId, updatedAt: new Date() })
        .where(eq(festivalActivityParticipants.id, participationId));

      return {
        success: true,
        message: "Participante movido de variante",
        activityId: participation.activityId,
        sourceDetailId: participation.detailsId,
      };
    });

    if (!result.success) return result;

    let invitedName: string | undefined;
    if (!options.undo) {
      try {
        const invited = await promoteFromWaitlist(
          result.activityId,
          result.sourceDetailId,
        );
        if (invited) invitedName = invited.displayName ?? "un perfil";
      } catch (waitlistError) {
        console.error("Error promoting from waitlist:", waitlistError);
      }
    }

    revalidatePath("/dashboard");
    return { success: true, message: result.message, invitedName };
  } catch (error) {
    console.error("Error moving activity participant:", error);
    return {
      success: false,
      message: "No se pudo mover al participante. Intentá nuevamente.",
    };
  }
}

export async function promoteWaitlistToVariant(
  activityId: number,
  targetDetailId: number,
): Promise<{
  success: boolean;
  message: string;
  promoted?: number;
  skipped?: number;
}> {
  const profile = await getAdminProfile();
  if (!profile) {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción",
    };
  }

  try {
    const [detail] = await db
      .select({
        participationLimit: festivalActivityDetails.participationLimit,
        category: festivalActivityDetails.category,
      })
      .from(festivalActivityDetails)
      .where(
        and(
          eq(festivalActivityDetails.id, targetDetailId),
          eq(festivalActivityDetails.activityId, activityId),
        ),
      );

    if (!detail) {
      return { success: false, message: "La variante de actividad no existe" };
    }

    const now = new Date();

    // Count active participants already in this variant
    const [{ activeCount }] = await db
      .select({ activeCount: count() })
      .from(festivalActivityParticipants)
      .where(
        and(
          eq(festivalActivityParticipants.detailsId, targetDetailId),
          isNull(festivalActivityParticipants.removedAt),
        ),
      );

    // Count outstanding reservations created by notifyWaitlistEntry
    const [{ reservedCount }] = await db
      .select({ reservedCount: count() })
      .from(festivalActivityWaitlist)
      .where(
        and(
          eq(festivalActivityWaitlist.notifiedForDetailId, targetDetailId),
          gt(festivalActivityWaitlist.expiresAt, now),
        ),
      );

    const remaining = detail.participationLimit
      ? detail.participationLimit - (activeCount + reservedCount)
      : null;

    if (remaining !== null && remaining <= 0) {
      return { success: false, message: "La variante ya está llena" };
    }

    // Fetch waitlist entries for this activity ordered by position
    const waitlistEntries = await db
      .select({
        id: festivalActivityWaitlist.id,
        userId: festivalActivityWaitlist.userId,
        userCategory: users.category,
        userEmail: users.email,
        userDisplayName: users.displayName,
      })
      .from(festivalActivityWaitlist)
      .innerJoin(users, eq(users.id, festivalActivityWaitlist.userId))
      .where(eq(festivalActivityWaitlist.activityId, activityId))
      .orderBy(asc(festivalActivityWaitlist.position));

    let promoted = 0;
    let skipped = 0;

    for (const entry of waitlistEntries) {
      if (remaining !== null && promoted >= remaining) break;

      // Skip if variant has category restriction and user doesn't match
      if (detail.category && entry.userCategory !== detail.category) {
        skipped++;
        continue;
      }

      const promotedInTx = await db.transaction(async (tx) => {
        // Re-check capacity inside transaction
        if (detail.participationLimit) {
          const txNow = new Date();
          const [{ currentActive }] = await tx
            .select({ currentActive: count() })
            .from(festivalActivityParticipants)
            .where(
              and(
                eq(festivalActivityParticipants.detailsId, targetDetailId),
                isNull(festivalActivityParticipants.removedAt),
              ),
            );
          const [{ currentReserved }] = await tx
            .select({ currentReserved: count() })
            .from(festivalActivityWaitlist)
            .where(
              and(
                eq(
                  festivalActivityWaitlist.notifiedForDetailId,
                  targetDetailId,
                ),
                gt(festivalActivityWaitlist.expiresAt, txNow),
              ),
            );
          if (currentActive + currentReserved >= detail.participationLimit) {
            return false; // Skip this entry, variant is now full
          }
        }

        // Check for existing (possibly soft-deleted) participant row
        const [existing] = await tx
          .select({
            id: festivalActivityParticipants.id,
            removedAt: festivalActivityParticipants.removedAt,
          })
          .from(festivalActivityParticipants)
          .where(
            and(
              eq(festivalActivityParticipants.detailsId, targetDetailId),
              eq(festivalActivityParticipants.userId, entry.userId),
            ),
          );

        if (existing && !existing.removedAt) {
          // Already actively enrolled — skip
          return false;
        }

        if (existing && existing.removedAt) {
          await tx
            .update(festivalActivityParticipants)
            .set({
              removedAt: null,
              removalReason: null,
              updatedAt: new Date(),
            })
            .where(eq(festivalActivityParticipants.id, existing.id));
        } else {
          await tx.insert(festivalActivityParticipants).values({
            userId: entry.userId,
            detailsId: targetDetailId,
          });
        }

        await tx
          .delete(festivalActivityWaitlist)
          .where(eq(festivalActivityWaitlist.id, entry.id));

        return true;
      });

      if (promotedInTx) {
        promoted++;
      }
      // TODO: send enrollment confirmation email to entry.userEmail
    }

    revalidatePath("/dashboard");
    return {
      success: true,
      message: `${promoted} participante(s) inscrito(s)${skipped > 0 ? `, ${skipped} omitido(s) por categoría` : ""}`,
      promoted,
      skipped,
    };
  } catch (error) {
    console.error("Error promoting waitlist to variant:", error);
    return { success: false, message: "Error al promover la lista de espera" };
  }
}

export async function notifyWaitlistEntry(
  waitlistEntryId: number,
  festivalId: number,
): Promise<{ success: boolean; message: string }> {
  const profile = await getAdminProfile();
  if (!profile) {
    return {
      success: false,
      message: "No tienes permisos para realizar esta acción",
    };
  }

  try {
    const txResult = await db.transaction(async (tx) => {
      // 1. Fetch the waitlist entry with user and activity info
      const entry = await tx.query.festivalActivityWaitlist.findFirst({
        where: eq(festivalActivityWaitlist.id, waitlistEntryId),
        with: {
          user: true,
          activity: {
            with: {
              festival: true,
              details: true,
            },
          },
        },
      });

      if (!entry) {
        return {
          ok: false as const,
          message: "La entrada en la lista de espera no existe",
        };
      }

      // A removal from any variant bars the whole activity, so the invitation
      // could never be accepted. Staff restore the participant instead.
      if (await wasRemovedFromActivity(tx, entry.activityId, entry.userId)) {
        return {
          ok: false as const,
          message:
            "El participante fue removido de esta actividad. Restauralo desde la lista de participantes.",
        };
      }

      // 2. Guard: already has an active invitation window
      const now = new Date();
      if (
        entry.notifiedAt &&
        entry.expiresAt &&
        now < new Date(entry.expiresAt)
      ) {
        return {
          ok: false as const,
          message: "El usuario ya tiene una invitación activa",
        };
      }

      const activity = entry.activity;

      if (!activity.waitlistWindowMinutes) {
        return {
          ok: false as const,
          message: "La actividad no tiene una lista de espera configurada",
        };
      }

      // 3. Find best matching variant (category-aware, capacity-aware)
      let matchedDetail: (typeof activity.details)[number] | null = null;
      for (const detail of activity.details) {
        const categoryMatches =
          !detail.category || detail.category === entry.user.category;
        if (!categoryMatches) continue;

        if (!detail.participationLimit) {
          matchedDetail = detail;
          break;
        }

        const [{ activeParticipants }] = await tx
          .select({ activeParticipants: count() })
          .from(festivalActivityParticipants)
          .where(
            and(
              eq(festivalActivityParticipants.detailsId, detail.id),
              isNull(festivalActivityParticipants.removedAt),
            ),
          );

        const [{ activeReservations }] = await tx
          .select({ activeReservations: count() })
          .from(festivalActivityWaitlist)
          .where(
            and(
              eq(festivalActivityWaitlist.notifiedForDetailId, detail.id),
              gt(festivalActivityWaitlist.expiresAt, now),
            ),
          );

        if (
          activeParticipants + activeReservations <
          detail.participationLimit
        ) {
          matchedDetail = detail;
          break;
        }
      }

      if (!matchedDetail) {
        return {
          ok: false as const,
          message: "No hay cupos disponibles para la categoría de este usuario",
        };
      }

      // 4. Prepare invitation window (persist only after email succeeds)
      const expiresAt = new Date(
        Date.now() + activity.waitlistWindowMinutes * 60 * 1000,
      );

      return {
        ok: true as const,
        entry,
        activity,
        expiresAt,
        now,
        matchedDetail,
      };
    });

    if (!txResult.ok) {
      return { success: false, message: txResult.message };
    }

    const { entry, activity, expiresAt, now, matchedDetail } = txResult;

    // 5. Send invitation email
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const activityUrl = `${baseUrl}/profiles/${entry.userId}/festivals/${festivalId}/activity/${activity.id}`;

    try {
      const result = await sendEmail({
        from: "Actividades del Festival <no-reply@productoraglitter.com>",
        to: [entry.user.email],
        subject: `Tenés un cupo disponible en ${activity.name}`,
        react: ActivityWaitlistInvitationEmail({
          userDisplayName: entry.user.displayName,
          userFirstName: entry.user.firstName,
          userLastName: entry.user.lastName,
          activityName: activity.name,
          festivalName: activity.festival.name,
          festivalType: activity.festival.festivalType,
          expiresAt,
          activityUrl,
        }),
      });
      assertSent(result);
    } catch (emailError) {
      console.error("Error sending waitlist invitation email:", emailError);
      return { success: false, message: "Error al enviar la notificación" };
    }

    const updateResult = await db
      .update(festivalActivityWaitlist)
      .set({
        notifiedAt: now,
        expiresAt,
        notifiedForDetailId: matchedDetail.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(festivalActivityWaitlist.id, waitlistEntryId),
          or(
            isNull(festivalActivityWaitlist.expiresAt),
            lte(festivalActivityWaitlist.expiresAt, now),
          ),
        ),
      )
      .returning({ id: festivalActivityWaitlist.id });

    if (updateResult.length === 0) {
      return {
        success: false,
        message: "No se pudo guardar la notificación; intentá nuevamente",
      };
    }

    revalidatePath(`/dashboard/festivals/${festivalId}/festival_activities`);
    return { success: true, message: "Notificación enviada correctamente" };
  } catch (error) {
    console.error("Error notifying waitlist entry:", error);
    return { success: false, message: "Error al enviar la notificación" };
  }
}
