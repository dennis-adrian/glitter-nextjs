"use server";

import { fetchAdminUsers } from "@/app/api/users/actions";
import { BaseProfile, UserCategory } from "@/app/api/users/definitions";
import FestivalActivityRegistrationEmail from "@/app/emails/festival-activity-registration";
import { NewFestivalActivityVote } from "@/app/lib/festival_activites/definitions";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
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
	festivalActivityDetails,
	festivalActivityParticipantProofs,
	festivalActivityParticipants,
	festivalActivityVotes,
	festivalActivityWaitlist,
	festivals,
	festivalSectors,
	reservationParticipants,
	standReservations,
	stands,
	users,
} from "@/db/schema";
import { deleteFile } from "@/app/lib/uploadthing/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import ActivityWaitlistInvitationEmail from "@/app/emails/activity-waitlist-invitation";
import {
	and,
	asc,
	count,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lt,
	ne,
	sql,
} from "drizzle-orm";
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
					orderBy: (details, { asc }) => [asc(details.id)],
					with: {
						participants: {
							with: {
								user: true,
								proofs: true,
							},
						},
						votes: true,
					},
				},
				waitlistEntries: { with: { user: true } },
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
	const currentUser = await getCurrentUserProfile();
	if (!currentUser) {
		throw new Error("Usuario no autenticado.");
	}

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
					eq(festivalActivityVotes.voterId, currentUser.id),
				),
			});

			if (existingVote) {
				throw new Error(
					"Ya tienes un voto registrado. No puedes votar nuevamente.",
				);
			}

			await tx.insert(festivalActivityVotes).values({
				...vote,
				voterId: currentUser.id,
			});
		});
	} catch (error) {
		console.error("Error adding festival activity vote", error);
		if (error instanceof Error) {
			if (error.message === "Usuario no autenticado.") {
				return {
					success: false,
					message: error.message,
				};
			}
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
			dbDetails.category !== forProfile.category
		) {
			return {
				success: false,
				message: "No tienes permisos para inscribirte en esta actividad",
			};
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
							eq(festivalActivityParticipants.userId, forProfile.id),
						),
					);

				if (existingInTx) {
					if (!existingInTx.removedAt) {
						return {
							success: false,
							message: "Ya estás inscrito en esta actividad",
						};
					}
					return {
						success: false,
						message: "No puedes re-inscribirte después de haber sido eliminado",
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
									eq(festivalActivityWaitlist.userId, forProfile.id),
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
					.values({ userId: forProfile.id, detailsId })
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
					festivalActivityName: dbActivity.name,
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

				const [newParticipant] = await tx
					.insert(festivalActivityParticipants)
					.values({ userId: forProfile.id, detailsId })
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

			const festival = await fetchBaseFestival(festivalId);
			const admins = await fetchAdminUsers();
			const adminEmails = admins.map((admin) => admin.email);

			await sendEmail({
				from: "Actividades del Festival <no-reply@productoraglitter.com>",
				to: [...adminEmails],
				subject: "Inscripción a una actividad del festival",
				react: FestivalActivityRegistrationEmail({
					festivalActivityName: dbActivity.name,
					userDisplayName: forProfile.displayName,
					festivalName: festival?.name,
					festivalType: festival?.festivalType,
				}),
			});

			revalidatePath(
				`/profiles/${forProfile.id}/festivals/${festivalId}/activity`,
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
	profileCategory: BaseProfile["category"],
) {
	try {
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
					message: "No tienes permisos para inscribirte en esta actividad",
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
						AND ${festivalActivityDetails.category} = ${profileCategory}
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
	imageUrls: string[],
	forProfileId: number,
) {
	const participation = await db.query.festivalActivityParticipants.findFirst({
		where: and(
			eq(festivalActivityParticipants.id, participationId),
			eq(festivalActivityParticipants.userId, forProfileId),
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
			message: "No tienes permiso para subir diseños a esta inscripción",
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
			message: "El período de subida ha finalizado",
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

	const urls = imageUrls
		.map((u) => (typeof u === "string" ? u.trim() : ""))
		.filter(Boolean);
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
		const participation = await db.query.festivalActivityParticipants.findFirst(
			{
				where: and(
					eq(festivalActivityParticipants.id, activityParticipationId),
					eq(festivalActivityParticipants.userId, forProfileId),
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
				message: "No tienes permiso para eliminar este diseño",
			};
		}

		const participationFestivalId =
			participation.activityDetail?.festivalActivity?.festivalId;
		if (participationFestivalId !== festivalId) {
			return {
				success: false,
				message: "No tienes permiso para eliminar este diseño",
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

export async function joinActivityWaitlist(
	forProfile: BaseProfile,
	activityId: number,
) {
	try {
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
			return activeParticipants.some((p) => p.userId === forProfile.id);
		});
		if (isEnrolled) {
			return { success: false, message: "Ya estás inscrito en esta actividad" };
		}

		// Check all limited variants the profile can join are actually full
		const eligibleDetails = activity.details.filter(
			(detail) =>
				detail.category === null || detail.category === forProfile.category,
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
							eq(festivalActivityWaitlist.userId, forProfile.id),
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
						userId: forProfile.id,
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
								eq(festivalActivityWaitlist.userId, forProfile.id),
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
					revalidatePath(`/profiles/${forProfile.id}`);
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

export async function promoteFromWaitlist(
	activityId: number,
	freedVariantId: number,
) {
	try {
		const [variant] = await db
			.select({
				category: festivalActivityDetails.category,
				activityName: festivalActivities.name,
				waitlistWindowMinutes: festivalActivities.waitlistWindowMinutes,
				festivalId: festivalActivities.festivalId,
				festivalName: festivals.name,
				festivalType: festivals.festivalType,
			})
			.from(festivalActivityDetails)
			.innerJoin(
				festivalActivities,
				eq(festivalActivities.id, festivalActivityDetails.activityId),
			)
			.innerJoin(festivals, eq(festivals.id, festivalActivities.festivalId))
			.where(eq(festivalActivityDetails.id, freedVariantId));

		if (!variant || variant.waitlistWindowMinutes == null) return;
		const waitlistWindowMinutes = variant.waitlistWindowMinutes;

		await db.transaction(async (tx) => {
			const notifiedAt = new Date();
			const expiresAt = new Date(
				Date.now() + waitlistWindowMinutes * 60 * 1000,
			);

			const claimResult = await tx.execute(
				sql`
					WITH next_entry AS (
						SELECT ${festivalActivityWaitlist.id} AS id
						FROM ${festivalActivityWaitlist}
						INNER JOIN ${users}
							ON ${users.id} = ${festivalActivityWaitlist.userId}
						WHERE ${festivalActivityWaitlist.activityId} = ${activityId}
							AND ${festivalActivityWaitlist.notifiedAt} IS NULL
							${variant.category ? sql`AND ${users.category} = ${variant.category}` : sql``}
						ORDER BY ${festivalActivityWaitlist.position} ASC
						LIMIT 1
						FOR UPDATE SKIP LOCKED
					)
					UPDATE ${festivalActivityWaitlist}
					SET
						${festivalActivityWaitlist.notifiedAt} = ${notifiedAt},
						${festivalActivityWaitlist.expiresAt} = ${expiresAt},
						${festivalActivityWaitlist.notifiedForDetailId} = ${freedVariantId},
						${festivalActivityWaitlist.updatedAt} = ${notifiedAt}
					FROM next_entry
					WHERE ${festivalActivityWaitlist.id} = next_entry.id
					RETURNING
						${festivalActivityWaitlist.id} AS id,
						${festivalActivityWaitlist.userId} AS "userId"
				`,
			);

			const claimedEntry = claimResult.rows[0] as
				| { id: number; userId: number }
				| undefined;
			if (!claimedEntry) return;

			const [nextUser] = await tx
				.select({
					userEmail: users.email,
					userDisplayName: users.displayName,
					userFirstName: users.firstName,
					userLastName: users.lastName,
				})
				.from(users)
				.where(eq(users.id, claimedEntry.userId))
				.limit(1);

			if (!nextUser) {
				throw new Error("Claimed waitlist user not found");
			}

			const baseUrl =
				process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
			const activityUrl = `${baseUrl}/profiles/${claimedEntry.userId}/festivals/${variant.festivalId}/activity/${activityId}`;

			await sendEmail({
				from: "Actividades del Festival <no-reply@productoraglitter.com>",
				to: [nextUser.userEmail],
				subject: `Tenés un cupo disponible en ${variant.activityName}`,
				react: ActivityWaitlistInvitationEmail({
					userDisplayName: nextUser.userDisplayName,
					userFirstName: nextUser.userFirstName,
					userLastName: nextUser.userLastName,
					activityName: variant.activityName,
					festivalName: variant.festivalName,
					festivalType: variant.festivalType,
					expiresAt,
					activityUrl,
				}),
			});
		});
	} catch (error) {
		console.error("Error promoting from waitlist", error);
	}
}

export async function enrollFromWaitlistInvitation(
	userId: number,
	waitlistEntryId: number,
	festivalId: number,
) {
	try {
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
			})
			.from(festivalActivityDetails)
			.where(eq(festivalActivityDetails.id, entry.notifiedForDetailId));

		if (!detail) {
			return { success: false, message: "La variante de actividad no existe" };
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

			if (existing) {
				if (!existing.removedAt) {
					throw new Error("Ya estás inscrito en esta actividad");
				}
				await ensureCapacityAvailable();
				await tx
					.update(festivalActivityParticipants)
					.set({ removedAt: null, updatedAt: new Date() })
					.where(eq(festivalActivityParticipants.id, existing.id));
			} else {
				// Verify capacity one more time
				await ensureCapacityAvailable();
				await tx.insert(festivalActivityParticipants).values({
					userId,
					detailsId: entry.notifiedForDetailId!,
				});
			}

			await tx
				.delete(festivalActivityWaitlist)
				.where(eq(festivalActivityWaitlist.id, waitlistEntryId));
		});

		revalidatePath(`/profiles/${userId}/festivals/${festivalId}/activity`);
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

export async function fetchParticipationPreviewData(participationId: number) {
	const batchData = await fetchParticipationPreviewDataBatch([participationId]);
	return batchData[participationId] ?? null;
}

export async function fetchParticipationPreviewDataBatch(
	participationIds: number[],
) {
	if (participationIds.length === 0) return {} as Record<
		number,
		{
			imageUrl: string | null;
			participantName: string | null;
			standLabels: string[];
			sectorName: string | null;
		}
	>;

	const uniqueParticipationIds = [...new Set(participationIds)];

	const rows = await db
		.select({
			participationId: festivalActivityParticipants.id,
			imageUrl: users.imageUrl,
			displayName: users.displayName,
			firstName: users.firstName,
			lastName: users.lastName,
			standLabels: sql<string[]>`
				coalesce(
					array_agg(
						concat(${stands.label}, ${stands.standNumber})
					) filter (where ${stands.label} is not null),
					'{}'
				)
			`,
			sectorName: sql<string | null>`max(${festivalSectors.name})`,
		})
		.from(festivalActivityParticipants)
		.innerJoin(users, eq(users.id, festivalActivityParticipants.userId))
		.innerJoin(
			festivalActivityDetails,
			eq(festivalActivityDetails.id, festivalActivityParticipants.detailsId),
		)
		.innerJoin(
			festivalActivities,
			eq(festivalActivities.id, festivalActivityDetails.activityId),
		)
		.innerJoin(festivals, eq(festivals.id, festivalActivities.festivalId))
		.leftJoin(
			reservationParticipants,
			eq(reservationParticipants.userId, festivalActivityParticipants.userId),
		)
		.leftJoin(
			standReservations,
			and(
				eq(standReservations.id, reservationParticipants.reservationId),
				eq(standReservations.festivalId, festivalActivities.festivalId),
				ne(standReservations.status, "rejected"),
			),
		)
		.leftJoin(stands, eq(stands.id, standReservations.standId))
		.leftJoin(festivalSectors, eq(festivalSectors.id, stands.festivalSectorId))
		.where(inArray(festivalActivityParticipants.id, uniqueParticipationIds))
		.groupBy(
			festivalActivityParticipants.id,
			users.imageUrl,
			users.displayName,
			users.firstName,
			users.lastName,
		);

	return rows.reduce<
		Record<
			number,
			{
				imageUrl: string | null;
				participantName: string | null;
				standLabels: string[];
				sectorName: string | null;
			}
		>
	>((acc, row) => {
		const participantName =
			row.displayName ??
			(`${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || null);

		acc[row.participationId] = {
			imageUrl: row.imageUrl ?? null,
			participantName,
			standLabels: row.standLabels,
			sectorName: row.sectorName ?? null,
		};
		return acc;
	}, {});
}
