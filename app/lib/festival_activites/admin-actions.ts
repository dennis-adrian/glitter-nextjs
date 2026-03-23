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
import { and, asc, count, eq, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/app/vendors/resend";
import ActivityProofReviewEmail from "@/app/emails/activity-proof-review";
import ActivityWaitlistInvitationEmail from "@/app/emails/activity-waitlist-invitation";
import { promoteFromWaitlist } from "@/app/lib/festival_activites/actions";
import React from "react";

export type FestivalActivityDetailInput = {
	/** Present for existing details, absent for new ones */
	id?: number;
	description?: string;
	participationLimit?: number;
	category?: ActivityUserCategory | null;
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
				.where(eq(festivalActivities.id, activityId));

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

	if (data.promoConditions && data.promoConditions.length > 300) {
		return {
			success: false,
			message: "Las condiciones no pueden superar los 300 caracteres",
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

		if (promoTrimmed.length > 80) {
			return {
				success: false,
				message: "La promoción no puede superar los 80 caracteres",
			};
		}

		const existingProof =
			await db.query.festivalActivityParticipantProofs.findFirst({
				where: eq(
					festivalActivityParticipantProofs.participationId,
					participationId,
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

	try {
		await db.transaction(async (tx) => {
			const proof = await tx.query.festivalActivityParticipantProofs.findFirst({
				where: eq(festivalActivityParticipantProofs.id, proofId),
			});

			if (!proof) throw new Error("Prueba no encontrada");

			await tx
				.update(festivalActivityParticipantProofs)
				.set({
					proofStatus: status,
					adminFeedback: adminFeedback?.trim() ?? null,
					updatedAt: new Date(),
				})
				.where(eq(festivalActivityParticipantProofs.id, proofId));

			if (status === "rejected_removed") {
				await tx
					.update(festivalActivityParticipants)
					.set({ removedAt: new Date(), updatedAt: new Date() })
					.where(eq(festivalActivityParticipants.id, proof.participationId));
			}
		});

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
					const subjects: Record<typeof status, string> = {
						approved: `Tu material fue aprobado - ${activity.name}`,
						rejected_resubmit: `Tu material necesita correcciones - ${activity.name}`,
						rejected_removed: `Fuiste removido de la actividad - ${activity.name}`,
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
		if (status === "rejected_removed") {
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
			.where(eq(festivalActivityDetails.id, targetDetailId));

		if (!detail) {
			return { success: false, message: "La variante de actividad no existe" };
		}

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

		const remaining = detail.participationLimit
			? detail.participationLimit - activeCount
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

			await db.transaction(async (tx) => {
				// Re-check capacity inside transaction
				if (detail.participationLimit) {
					const [{ currentActive }] = await tx
						.select({ currentActive: count() })
						.from(festivalActivityParticipants)
						.where(
							and(
								eq(festivalActivityParticipants.detailsId, targetDetailId),
								isNull(festivalActivityParticipants.removedAt),
							),
						);
					if (currentActive >= detail.participationLimit) {
						return; // Skip this entry, variant is now full
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
					return;
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
			});

			promoted++;
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
		// 1. Fetch the waitlist entry with user and activity info
		const entry = await db.query.festivalActivityWaitlist.findFirst({
			where: eq(festivalActivityWaitlist.id, waitlistEntryId),
			with: {
				user: true,
				activity: {
					with: {
						festival: true,
						details: {
							with: {
								participants: {
									where: isNull(festivalActivityParticipants.removedAt),
								},
							},
						},
					},
				},
			},
		});

		if (!entry) {
			return {
				success: false,
				message: "La entrada en la lista de espera no existe",
			};
		}

		// 2. Guard: already has an active invitation window
		if (
			entry.notifiedAt &&
			entry.expiresAt &&
			new Date() < new Date(entry.expiresAt)
		) {
			return {
				success: false,
				message: "El usuario ya tiene una invitación activa",
			};
		}

		const activity = entry.activity;

		if (!activity.waitlistWindowMinutes) {
			return {
				success: false,
				message: "La actividad no tiene una lista de espera configurada",
			};
		}

		// 3. Find best matching variant (category-aware, capacity-aware)
		const matchedDetail = activity.details.find((detail) => {
			const categoryMatches =
				!detail.category || detail.category === entry.user.category;
			const hasCapacity =
				!detail.participationLimit ||
				detail.participants.length < detail.participationLimit;
			return categoryMatches && hasCapacity;
		});

		if (!matchedDetail) {
			return {
				success: false,
				message: "No hay cupos disponibles para la categoría de este usuario",
			};
		}

		// 4. Update the waitlist entry
		const expiresAt = new Date(
			Date.now() + activity.waitlistWindowMinutes * 60 * 1000,
		);

		await db
			.update(festivalActivityWaitlist)
			.set({
				notifiedAt: new Date(),
				expiresAt,
				notifiedForDetailId: matchedDetail.id,
				updatedAt: new Date(),
			})
			.where(eq(festivalActivityWaitlist.id, waitlistEntryId));

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
		}

		revalidatePath(`/dashboard/festivals/${festivalId}/festival_activities`);
		return { success: true, message: "Notificación enviada correctamente" };
	} catch (error) {
		console.error("Error notifying waitlist entry:", error);
		return { success: false, message: "Error al enviar la notificación" };
	}
}
