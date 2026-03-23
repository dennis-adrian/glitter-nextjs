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
import ActivityWaitlistInvitationEmail from "@/app/emails/activity-waitlist-invitation";
import {
	and,
	asc,
	count,
	eq,
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
					// Was previously removed (e.g. promoted from waitlist) — reactivate
					await tx
						.update(festivalActivityParticipants)
						.set({ removedAt: null, updatedAt: new Date() })
						.where(eq(festivalActivityParticipants.id, existingInTx.id));
					return {
						success: true,
						message: "Inscripción realizada correctamente",
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
				if (activity.waitlistWindowMinutes) {
					const [{ totalCount }] = await tx
						.select({ totalCount: count() })
						.from(festivalActivityParticipants)
						.where(eq(festivalActivityParticipants.detailsId, detailsId));

					if (totalCount >= participationLimit) {
						const [waitlistEntry] = await tx
							.select({ id: festivalActivityWaitlist.id })
							.from(festivalActivityWaitlist)
							.where(
								and(
									eq(festivalActivityWaitlist.activityId, activity.id),
									eq(festivalActivityWaitlist.userId, forProfile.id),
									isNotNull(festivalActivityWaitlist.notifiedAt),
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

				await tx.insert(festivalActivityParticipants).values({
					userId: forProfile.id,
					detailsId,
				});

				return {
					success: true,
					message: "Inscripción realizada correctamente",
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

				await tx.insert(festivalActivityParticipants).values({
					userId: forProfile.id,
					detailsId,
				});

				return {
					success: true,
					message: "Inscripción realizada correctamente",
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

		// Check all limited variants are actually full
		const allFull = activity.details.every((detail) => {
			const activeParticipants = detail.participants.filter(
				(p) => p.removedAt === null,
			);
			return (
				!detail.participationLimit ||
				activeParticipants.length >= detail.participationLimit
			);
		});
		if (!allFull) {
			return {
				success: false,
				message: "Todavía hay cupos disponibles en esta actividad",
			};
		}

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
					success: false,
					message: "Ya estás en la lista de espera de esta actividad",
				};
			}

			const [maxRow] = await tx
				.select({
					maxPos: sql<number>`coalesce(max(${festivalActivityWaitlist.position}), 0)`,
				})
				.from(festivalActivityWaitlist)
				.where(eq(festivalActivityWaitlist.activityId, activityId));

			const position = (maxRow?.maxPos ?? 0) + 1;

			await tx.insert(festivalActivityWaitlist).values({
				activityId,
				userId: forProfile.id,
				position,
			});

			return {
				success: true,
				message: "Te uniste a la lista de espera",
				position,
			};
		});

		if (result.success) {
			revalidatePath(`/profiles/${forProfile.id}`);
		}
		return result;
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

		if (!variant || !variant.waitlistWindowMinutes) return;

		// Find first eligible waitlisted user (category-aware, skip those already in active window)
		const waitlistQuery = db
			.select({
				id: festivalActivityWaitlist.id,
				userId: festivalActivityWaitlist.userId,
				userEmail: users.email,
				userDisplayName: users.displayName,
				userFirstName: users.firstName,
				userLastName: users.lastName,
			})
			.from(festivalActivityWaitlist)
			.innerJoin(users, eq(users.id, festivalActivityWaitlist.userId))
			.where(
				and(
					eq(festivalActivityWaitlist.activityId, activityId),
					isNull(festivalActivityWaitlist.notifiedAt),
					variant.category ? eq(users.category, variant.category) : undefined,
				),
			)
			.orderBy(asc(festivalActivityWaitlist.position))
			.limit(1);

		const [nextUser] = await waitlistQuery;

		if (!nextUser) return;

		const expiresAt = new Date(
			Date.now() + variant.waitlistWindowMinutes * 60 * 1000,
		);

		await db
			.update(festivalActivityWaitlist)
			.set({
				notifiedAt: new Date(),
				expiresAt,
				notifiedForDetailId: freedVariantId,
				updatedAt: new Date(),
			})
			.where(eq(festivalActivityWaitlist.id, nextUser.id));

		const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
		const activityUrl = `${baseUrl}/profiles/${nextUser.userId}/festivals/${variant.festivalId}/activity/${activityId}`;

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

		if (!entry.notifiedAt || !entry.notifiedForDetailId) {
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
				await tx
					.update(festivalActivityParticipants)
					.set({ removedAt: null, updatedAt: new Date() })
					.where(eq(festivalActivityParticipants.id, existing.id));
			} else {
				// Verify capacity one more time
				if (detail.participationLimit) {
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
					if (activeCount >= detail.participationLimit) {
						throw new Error("El cupo ya no está disponible");
					}
				}
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
	const [row] = await db
		.select({
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
		.where(eq(festivalActivityParticipants.id, participationId))
		.groupBy(
			users.imageUrl,
			users.displayName,
			users.firstName,
			users.lastName,
		);

	if (!row) return null;

	const participantName =
		row.displayName ??
		(`${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || null);

	return {
		imageUrl: row.imageUrl ?? null,
		participantName,
		standLabels: row.standLabels,
		sectorName: row.sectorName ?? null,
	};
}
