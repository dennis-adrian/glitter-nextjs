"use server";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
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
import ActivityProofReviewEmail from "@/app/emails/activity-proof-review";
import ActivityWaitlistInvitationEmail from "@/app/emails/activity-waitlist-invitation";
import { promoteFromWaitlist } from "@/app/lib/festival_activites/actions";
import { getMaterialConfig } from "@/app/lib/festival_activites/helpers";
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
		| "coupon_book";
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

function proofUploadLimitValidationMessage(
	data: FestivalActivityInput,
): string | null {
	if ((data.proofType ?? null) === null) {
		return null;
	}
	const d = data.proofUploadLimitDate;
	if (d == null || Number.isNaN(d.getTime())) {
		return PROOF_LIMIT_REQUIRED_MESSAGE;
	}
	return null;
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

	const proofLimitMsg = proofUploadLimitValidationMessage(data);
	if (proofLimitMsg) {
		return { success: false, message: proofLimitMsg };
	}

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
				data.details.map((detail) => ({
					activityId: activity.id,
					description: detail.description,
					participationLimit: detail.participationLimit,
					category: detail.category ?? null,
					imageUrl: detail.imageUrl ?? null,
					couponBookHeaderImageUrl: detail.couponBookHeaderImageUrl ?? null,
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

	const proofLimitMsgUpdate = proofUploadLimitValidationMessage(data);
	if (proofLimitMsgUpdate) {
		return { success: false, message: proofLimitMsgUpdate };
	}

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
				data.details.filter((d) => d.id != null).map((d) => d.id as number),
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
			for (const detail of data.details.filter(
				(d) => d.id != null && existingIds.has(d.id),
			)) {
				await tx
					.update(festivalActivityDetails)
					.set({
						description: detail.description,
						participationLimit: detail.participationLimit ?? null,
						category: detail.category ?? null,
						imageUrl: detail.imageUrl ?? null,
						couponBookHeaderImageUrl: detail.couponBookHeaderImageUrl ?? null,
					})
					.where(eq(festivalActivityDetails.id, detail.id as number));
			}

			// Insert new details
			const newDetails = data.details.filter((d) => d.id == null);
			if (newDetails.length > 0) {
				await tx.insert(festivalActivityDetails).values(
					newDetails.map((detail) => ({
						activityId,
						description: detail.description,
						participationLimit: detail.participationLimit,
						category: detail.category ?? null,
						imageUrl: detail.imageUrl ?? null,
						couponBookHeaderImageUrl: detail.couponBookHeaderImageUrl ?? null,
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

		const proofType =
			participation.activityDetail?.festivalActivity?.proofType ?? null;
		const proofUploadLimitDate =
			participation.activityDetail?.festivalActivity?.proofUploadLimitDate ??
			null;

		if (proofUploadLimitDate && new Date() > new Date(proofUploadLimitDate)) {
			return {
				success: false,
				message: "El período de subida de pruebas ha finalizado",
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
					await sendEmail({
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
					await sendEmail({
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
				.set({ removedAt: null, updatedAt: new Date() })
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
						.set({ removedAt: null, updatedAt: new Date() })
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
			await sendEmail({
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
