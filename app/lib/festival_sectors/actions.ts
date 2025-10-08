"use server";

import { StandBase } from "@/app/api/stands/definitions";
import { fetchAdminUsers } from "@/app/api/users/actions";
import {
	BaseProfile,
	Participation,
	UserCategory,
} from "@/app/api/users/definitions";
import {
	ActivityDetailsWithParticipants,
	FullFestival,
} from "@/app/lib/festivals/definitions";
import FestivalActivityRegistrationEmail from "@/app/emails/festival-activity-registration";
import {
	FestivalSectorBase,
	FestivalSectorWithStands,
	FestivalSectorWithStandsWithReservationsWithParticipants,
} from "@/app/lib/festival_sectors/definitions";
import { getFestivalSectorAllowedCategories } from "@/app/lib/festival_sectors/helpers";
import {
	FestivalActivity,
	FestivalBase,
} from "@/app/lib/festivals/definitions";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import {
	festivalActivityParticipantProofs,
	festivalActivityParticipants,
	festivals,
	festivalSectors,
	reservationParticipants,
	standReservations,
	stands,
	users,
} from "@/db/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function fetchFestivalSectors(
	festivalId: number,
): Promise<FestivalSectorWithStandsWithReservationsWithParticipants[]> {
	try {
		return await db.query.festivalSectors.findMany({
			with: {
				stands: {
					with: {
						reservations: {
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
							},
						},
					},
				},
			},
			orderBy: festivalSectors.orderInFestival,
			where: eq(festivalSectors.festivalId, festivalId),
		});
	} catch (error) {
		console.error("Error fetching festival sectors", error);
		return [];
	}
}

export async function fetchFestivalSectorsByUserCategory(
	festivalId: number,
	category: UserCategory,
): Promise<FestivalSectorWithStandsWithReservationsWithParticipants[]> {
	try {
		return await db.transaction(async (tx) => {
			const sectorIds = await tx
				.selectDistinctOn([festivalSectors.id], {
					id: festivalSectors.id,
				})
				.from(festivalSectors)
				.leftJoin(festivals, eq(festivals.id, festivalSectors.festivalId))
				.leftJoin(stands, eq(stands.festivalSectorId, festivalSectors.id))
				.where(
					and(eq(festivals.id, festivalId), eq(stands.standCategory, category)),
				);

			return await db.query.festivalSectors.findMany({
				where: inArray(
					festivalSectors.id,
					sectorIds.map((sector) => sector.id),
				),
				with: {
					stands: {
						with: {
							reservations: {
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
								},
							},
						},
					},
				},
			});
		});
	} catch (error) {
		console.error("Error fetching festival sectors", error);
		return [];
	}
}

export async function fetchConfirmedProfilesByFestivalId(
	festivalId: number
): Promise<
	(BaseProfile & { stands: StandBase[]; participations: Participation[] })[]
> {
	try {
		const res = await db
			.select()
			.from(users)
			.leftJoin(
				reservationParticipants,
				eq(reservationParticipants.userId, users.id)
			)
			.leftJoin(
				standReservations,
				eq(standReservations.id, reservationParticipants.reservationId)
			)
			.leftJoin(stands, eq(stands.id, standReservations.standId))
			.leftJoin(festivals, eq(festivals.id, standReservations.festivalId))
			.where(
				and(
					eq(standReservations.festivalId, festivalId),
					eq(standReservations.status, "accepted")
				)
			);
		const userIds = Array.from(
			new Set(res.map((row) => row.users.id).filter(Boolean))
		);

		// 2) Fetch ALL accepted participations for those users (across ALL festivals)
		//    If you only need counts, do a grouped count; if you need full objects,
		//    fetch the rows and build them like you do below.
		const allAccepted = await db
			.select({
				userId: reservationParticipants.userId,
				part: reservationParticipants,
				resv: standReservations,
				st: stands,
				fest: festivals,
			})
			.from(reservationParticipants)
			.innerJoin(
				standReservations,
				eq(standReservations.id, reservationParticipants.reservationId)
			)
			.innerJoin(stands, eq(stands.id, standReservations.standId))
			.innerJoin(festivals, eq(festivals.id, standReservations.festivalId))
			.where(
				and(
					inArray(reservationParticipants.userId, userIds),
					eq(standReservations.status, "accepted")
				)
			);

		// 3) Build a per-user list of ALL accepted participations
		const allUsersParticipationsObject: Record<number, Participation[]> = {};
		allAccepted.forEach((row) => {
			const uid = row.userId;
			if (!row.part || !row.resv) return;

			const participation: Participation = {
				...row.part,
				reservation: {
					...row.resv,
					stand: row.st ?? undefined,
					festival: row.fest ?? undefined,
				},
			};

			(allUsersParticipationsObject[uid] ??= []).push(participation);
		});

		// 4) Build the final profiles list.
		//    - stands: only for THIS festival (from the first query)
		//    - participations: ALL accepted (from the second query)
		const profilesObject = res.reduce((acc, row) => {
			const uid = row.users.id;

			// stands for current festival (avoid duplicates)
			const accStands = acc[uid]?.stands ?? [];
			if (row.stands) {
				const already = accStands.some((s) => s.id === row.stands!.id);
				if (!already) accStands.push(row.stands);
				accStands.sort((a, b) => a.standNumber - b.standNumber);
			}

			const accParticipations = allUsersParticipationsObject[uid] ?? [];

			acc[uid] = {
				...row.users,
				stands: accStands,
				participations: accParticipations,
			};

			return acc;
		}, {} as Record<number, BaseProfile & { stands: StandBase[]; participations: Participation[] }>);

		return Object.values(profilesObject);
	} catch (error) {
		console.error("Error fetching confirmed profiles", error);
		return [];
	}
}

export async function enrollInActivity(
	user: BaseProfile,
	festival: FestivalBase,
	activityDetails: ActivityDetailsWithParticipants,
	activity: FestivalActivity,
) {
	try {
		const { id: detailsId, participationLimit } = activityDetails;

		if (participationLimit && participationLimit > 0) {
			// Use a transaction to ensure atomicity
			const result = await db.transaction(async (tx) => {
				// Check if there's space available
				const currentParticipantsCount = await tx
					.select({ count: count() })
					.from(festivalActivityParticipants)
					.where(eq(festivalActivityParticipants.detailsId, detailsId));

				if (currentParticipantsCount[0].count >= participationLimit) {
					return { success: false, message: "Ya no hay cupo disponible" };
				}

				// If there's space, insert the new participant
				await tx.insert(festivalActivityParticipants).values({
					userId: user.id,
					detailsId,
				});

				return {
					success: true,
					message: "Inscripción realizada correctamente",
				};
			});

			const admins = await fetchAdminUsers();
			const adminEmails = admins.map((admin) => admin.email);

			await sendEmail({
				from: "Actividades del Festival <no-reply@productoraglitter.com>",
				to: [...adminEmails],
				subject: "Inscripción a una actividad del festival",
				react: FestivalActivityRegistrationEmail({
					festival,
					festivalActivity: activity,
					user: user,
				}),
			});

			revalidatePath(`/profiles/${user.id}/festivals/${festival.id}/activity`);
			return result;
		} else {
			// If there's no participation limit, just insert
			await db.insert(festivalActivityParticipants).values({
				userId: user.id,
				detailsId,
			});

			revalidatePath(`/profiles/${user.id}/festivals/${festival.id}/activity`);
			return { success: true, message: "Inscripción realizada correctamente" };
		}
	} catch (error) {
		console.error("Error enrolling in activity", error);
		return { success: false, message: "Error al inscribirse en la actividad" };
	}
}

export async function fetchFullFestivalById(
	festivalId: number,
): Promise<FullFestival | undefined | null> {
	try {
		return await db.query.festivals.findFirst({
			where: eq(festivals.id, festivalId),
			with: {
				festivalDates: true,
				userRequests: {
					with: {
						user: {
							with: {
								participations: {
									with: {
										reservation: {
											with: {
												stand: true,
												festival: true,
											},
										},
									},
								},
								userRequests: true,
							},
						},
					},
				},
				standReservations: true,
				festivalSectors: {
					with: {
						stands: true,
					},
				},
				festivalActivities: {
					with: {
						details: {
							with: {
								participants: {
									with: {
										user: true,
										proofs: true,
									},
								},
							},
						},
					},
				},
			},
		});
	} catch (error) {
		console.error("Error fetching full festival", error);
		return null;
	}
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

export async function fetchFestivalSectorsWithAllowedCategories(
	festivalId: number,
): Promise<
	(FestivalSectorWithStands & {
		allowedCategories: UserCategory[];
	})[]
> {
	try {
		const sectors = await db.query.festivalSectors.findMany({
			with: {
				stands: true,
			},
			where: eq(festivalSectors.festivalId, festivalId),
		});

		return sectors.map((sector) => ({
			...sector,
			allowedCategories: getFestivalSectorAllowedCategories(sector),
		}));
	} catch (error) {
		console.error(
			"Error fetching festival sectors with allowed categories",
			error,
		);
		return [];
	}
}
