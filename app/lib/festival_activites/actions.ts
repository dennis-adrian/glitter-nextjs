"use server";

import { fetchAdminUsers } from "@/app/api/users/actions";
import { BaseProfile, UserCategory } from "@/app/api/users/definitions";
import FestivalActivityRegistrationEmail from "@/app/emails/festival-activity-registration";
import { NewFestivalActivityVote } from "@/app/lib/festival_activites/definitions";
import {
	fetchBaseFestival,
	fetchFestivalParticipants,
} from "@/app/lib/festivals/actions";
import {
	ActivityDetailsWithParticipants,
	FestivalActivity,
	FestivalActivityWithDetailsAndParticipants,
	FestivalBase,
} from "@/app/lib/festivals/definitions";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import {
	festivalActivities,
	festivalActivityParticipantProofs,
	festivalActivityParticipants,
	festivalActivityVotes,
} from "@/db/schema";
import { deleteFile } from "@/app/lib/uploadthing/actions";
import { and, count, eq, isNull } from "drizzle-orm";
import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";

export const fetchFestivalActivity = async (
	activityId: number,
): Promise<FestivalActivityWithDetailsAndParticipants | null> => {
	try {
		const activity = await db.query.festivalActivities.findFirst({
			where: eq(festivalActivities.id, activityId),
			with: {
				details: {
					with: {
						participants: {
							where: isNull(festivalActivityParticipants.removedAt),
							with: {
								user: true,
								proofs: true,
							},
						},
						votes: true,
					},
				},
			},
		});

		if (!activity) return null;

		return activity;
	} catch (error) {
		console.error("Error fetching festival activity", error);
		return null;
	}
};

export const fetchActivityVariantVotes = async (variantId: number) => {
	try {
		return await db.query.festivalActivityVotes.findMany({
			where: eq(festivalActivityVotes.activityVariantId, variantId),
			with: {
				stand: true,
				participant: true,
				voter: true,
			},
		});
	} catch (error) {
		console.error("Error fetching activity variant votes", error);
		return [];
	}
};

export const addFestivalActivityVote = async (
	vote: NewFestivalActivityVote,
) => {
	if (vote.votableType === "stand" && !vote.standId) {
		return {
			success: false,
			message: "El stand no existe",
		};
	}

	if (vote.votableType === "participant" && !vote.participantId) {
		return {
			success: false,
			message: "El participante no existe",
		};
	}

	try {
		await db.transaction(async (tx) => {
			const existingVote = await tx.query.festivalActivityVotes.findFirst({
				where: and(
					eq(festivalActivityVotes.activityVariantId, vote.activityVariantId),
					eq(festivalActivityVotes.voterId, vote.voterId),
				),
			});

			if (existingVote) {
				throw new Error(
					"Ya tienes un voto registrado. No puedes votar nuevamente.",
				);
			}

			await tx.insert(festivalActivityVotes).values(vote);
		});
	} catch (error) {
		console.error("Error adding festival activity vote", error);
		if (error instanceof Error) {
			if (
				error.message ===
				"Ya tienes un voto registrado. No puedes votar nuevamente."
			) {
				return {
					success: false,
					message: error.message,
				};
			}
		}

		return {
			success: false,
			message: "Error al agregar el voto",
		};
	}

	revalidatePath(`/profiles/${vote.voterId}`);

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
		const { id: detailsId, participationLimit } = activityDetails;

		/**
		 * Users need to have a valid category in case there are accepted categories
		 * If there are no accepted categories, we can assume all categories are accepted
		 */
		if (
			acceptedCategories.length > 0 &&
			!acceptedCategories.includes(forProfile.category)
		) {
			return {
				success: false,
				message: "No tienes permisos para inscribirte en esta actividad",
			};
		}

		const existingEnrollment = await db
			.select({ id: festivalActivityParticipants.id })
			.from(festivalActivityParticipants)
			.where(
				and(
					eq(festivalActivityParticipants.detailsId, detailsId),
					eq(festivalActivityParticipants.userId, forProfile.id),
				),
			);

		if (existingEnrollment.length > 0) {
			return {
				success: false,
				message: "Ya estás inscrito en esta actividad",
			};
		}

		if (participationLimit && participationLimit > 0) {
			const result = await db.transaction(async (tx) => {
				const [existingInTx] = await tx
					.select({ id: festivalActivityParticipants.id })
					.from(festivalActivityParticipants)
					.where(
						and(
							eq(festivalActivityParticipants.detailsId, detailsId),
							eq(festivalActivityParticipants.userId, forProfile.id),
						),
					);

				if (existingInTx) {
					return {
						success: false,
						message: "Ya estás inscrito en esta actividad",
					};
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

				await tx.insert(festivalActivityParticipants).values({
					userId: forProfile.id,
					detailsId,
				});

				return {
					success: true,
					message: "Inscripción realizada correctamente",
				};
			});

			/**
			 * Fetching user and festival here because passing down the whole user and
			 * festival object is too cumbersome
			 */
			const festival = await fetchBaseFestival(festivalId);

			const admins = await fetchAdminUsers();
			const adminEmails = admins.map((admin) => admin.email);

			await sendEmail({
				from: "Actividades del Festival <no-reply@productoraglitter.com>",
				to: [...adminEmails],
				subject: "Inscripción a una actividad del festival",
				react: FestivalActivityRegistrationEmail({
					festivalActivityName: activity.name,
					userDisplayName: forProfile.displayName,
					festivalName: festival?.name,
					festivalType: festival?.festivalType,
				}),
			});

			revalidatePath(
				`/profiles/${forProfile.id}/festivals/${festivalId}/activity`,
			);
			return result;
		} else {
			// If there's no participation limit, just insert
			await db.insert(festivalActivityParticipants).values({
				userId: forProfile.id,
				detailsId,
			});

			revalidatePath(
				`/profiles/${forProfile.id}/festivals/${festivalId}/activity`,
			);
			return { success: true, message: "Inscripción realizada correctamente" };
		}
	} catch (error) {
		console.error("Error enrolling in activity", error);
		return { success: false, message: "Error al inscribirse en la actividad" };
	}
}

export async function enrollInBestStandActivity(
	activityId: number,
	forProfileId: BaseProfile["id"],
	festivalId: FestivalBase["id"],
	profileCategory: BaseProfile["category"],
) {
	try {
		const confirmedParticipants = await fetchFestivalParticipants(
			festivalId,
			true,
		);

		if (
			!confirmedParticipants.some(
				(participant) => participant.user.id === forProfileId,
			)
		) {
			return {
				success: false,
				message: "No tienes permisos para inscribirte en esta actividad",
			};
		}

		const activity = await fetchFestivalActivity(activityId);

		if (!activity) {
			return {
				success: false,
				message: "La actividad a la que querés inscribirte no existe",
			};
		}

		if (
			DateTime.now() < DateTime.fromJSDate(activity.registrationStartDate) ||
			DateTime.now() > DateTime.fromJSDate(activity.registrationEndDate)
		) {
			return {
				success: false,
				message:
					"El registro para la actividad no está disponible en este momento",
			};
		}

		const activityVariant = activity.details.find(
			(detail) => detail.category === profileCategory,
		);

		if (!activityVariant) {
			return {
				success: false,
				message: "No pudimos registrarte en la actividad.",
			};
		}

		if (
			activityVariant.participants.some(
				(participant) => participant.user.id === forProfileId,
			)
		) {
			return {
				success: false,
				message: "Ya estás inscrito en esta actividad",
			};
		}

		if (profileCategory !== activityVariant.category) {
			return {
				success: false,
				message: "No tienes permisos para inscribirte en esta actividad",
			};
		}

		const forProfileStandId = confirmedParticipants.find(
			(participant) => participant.user.id === forProfileId,
		)?.reservation?.standId;

		const otherParticipantsWithStand = confirmedParticipants.filter(
			(participant) =>
				participant.reservation?.standId === forProfileStandId &&
				participant.user.id !== forProfileId,
		);

		// Verify if none of the other participants in the same stand is enrolled
		const activityParticipantUserIds = activityVariant.participants.map(
			(participant) => participant.userId,
		);
		for (const participant of otherParticipantsWithStand) {
			if (activityParticipantUserIds.includes(participant.user.id)) {
				return {
					success: false,
					message: `Otro participante ya registró el stand ${participant.reservation?.stand?.label}${participant.reservation?.stand?.standNumber}`,
				};
			}
		}

		await db.insert(festivalActivityParticipants).values({
			userId: forProfileId,
			detailsId: activityVariant.id,
		});
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
	imageUrls: string[],
) {
	try {
		await db.insert(festivalActivityParticipantProofs).values(
			imageUrls.map((url) => ({
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
		// First, fetch the proof to get the imageUrl
		const proof = await db.query.festivalActivityParticipantProofs.findFirst({
			where: eq(festivalActivityParticipantProofs.id, proofId),
		});

		if (!proof) {
			return { success: false, message: "Diseño no encontrado" };
		}

		// Delete the image from UploadThing (imageUrl may be null for text-only proofs)
		if (proof.imageUrl) {
			const imageDeleted = await deleteFile(proof.imageUrl);
			if (!imageDeleted.success) {
				return { success: false, message: "Error al eliminar el diseño" };
			}
		}

		await db
			.delete(festivalActivityParticipantProofs)
			.where(
				and(
					eq(festivalActivityParticipantProofs.id, proofId),
					eq(
						festivalActivityParticipantProofs.participationId,
						activityParticipationId,
					),
				),
			);
	} catch (error) {
		console.error("Error deleting festival activity participant proof", error);
		return { success: false, message: "Error al eliminar el diseño" };
	}

	revalidatePath(`/profiles/${forProfileId}/festivals/${festivalId}/activity`);
	return { success: true, message: "Diseño eliminado correctamente" };
}
