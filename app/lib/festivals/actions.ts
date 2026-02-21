"use server";

import {
	BaseProfile,
	ParticipationWithParticipantWithInfractionsAndReservations,
} from "@/app/api/users/definitions";
import { fetchVisitorsEmails } from "@/app/data/visitors/actions";
import EmailTemplate from "@/app/emails/festival-activation";
import RegistrationInvitationEmailTemplate from "@/app/emails/registration-invitation";
import { getFestivalSectorAllowedCategories } from "@/app/lib/festival_sectors/helpers";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import {
	festivalActivities,
	festivalDates,
	festivals,
	festivalSectors,
	profileSubcategories,
	reservationParticipants,
	standReservations,
	userRequests,
	users,
} from "@/db/schema";
import { and, desc, eq, getTableColumns, inArray, not, or } from "drizzle-orm";
import { cacheLife, cacheTag, revalidatePath, updateTag } from "next/cache";
import {
	FestivalBase,
	FestivalWithDates,
	FestivalWithDatesAndSectors,
	FestivalWithTicketsAndDates,
	FullFestival,
} from "./definitions";
import { groupVisitorEmails } from "./utils";
import { UserRequest } from "@/app/api/user_requests/definitions";

export async function createFestival(
	festivalData: Omit<typeof festivals.$inferInsert, "id"> & {
		dates?: Array<{
			date: Date;
			startTime: string;
			endTime: string;
		}>;
		dateDetails?: Array<{
			startDate: Date;
			endDate: Date;
		}>;
		festivalSectors?: Array<{
			name: string;
			orderInFestival: number;
			mapUrl?: string | null;
			mascotUrl?: string | null;
		}>;
	},
) {
	try {
		const result = await db.transaction(async (tx) => {
			const [newFestival] = await tx
				.insert(festivals)
				.values({
					name: festivalData.name,
					description: festivalData.description || null,
					address: festivalData.address || null,
					locationLabel: festivalData.locationLabel || null,
					locationUrl: festivalData.locationUrl || null,
					status: festivalData.status || "draft",
					mapsVersion: festivalData.mapsVersion || "v1",
					publicRegistration: festivalData.publicRegistration || false,
					eventDayRegistration: festivalData.eventDayRegistration || false,
					festivalType: festivalData.festivalType || "glitter",
					reservationsStartDate:
						festivalData.reservationsStartDate || new Date(),
					generalMapUrl: festivalData.generalMapUrl || null,
					mascotUrl: festivalData.mascotUrl || null,
					illustrationPaymentQrCodeUrl:
						festivalData.illustrationPaymentQrCodeUrl || null,
					gastronomyPaymentQrCodeUrl:
						festivalData.gastronomyPaymentQrCodeUrl || null,
					entrepreneurshipPaymentQrCodeUrl:
						festivalData.entrepreneurshipPaymentQrCodeUrl || null,
					illustrationStandUrl: festivalData.illustrationStandUrl || null,
					gastronomyStandUrl: festivalData.gastronomyStandUrl || null,
					entrepreneurshipStandUrl:
						festivalData.entrepreneurshipStandUrl || null,
					festivalCode: festivalData.festivalCode || null,
					festivalBannerUrl: festivalData.festivalBannerUrl || null,
					updatedAt: new Date(),
					createdAt: new Date(),
				})
				.returning();

			if (festivalData.dateDetails && festivalData.dateDetails.length > 0) {
				for (const dateItem of festivalData.dateDetails) {
					await tx.insert(festivalDates).values({
						festivalId: newFestival.id,
						startDate: dateItem.startDate,
						endDate: dateItem.endDate,
						updatedAt: new Date(),
						createdAt: new Date(),
					});
				}
			}
			if (
				festivalData.festivalSectors &&
				festivalData.festivalSectors.length > 0
			) {
				for (const sector of festivalData.festivalSectors) {
					await tx.insert(festivalSectors).values({
						festivalId: newFestival.id,
						name: sector.name,
						orderInFestival: sector.orderInFestival,
						mapUrl: sector.mapUrl || null,
						mascotUrl: sector.mascotUrl || null,
						updatedAt: new Date(),
						createdAt: new Date(),
					});
				}
			}
			return newFestival;
		});

		revalidatePath("/dashboard/festivals");
		updateTag("active-festival");
		return {
			success: true,
			message: "Festival creado exitosamente!",
			data: result,
		};
	} catch (error) {
		console.error("Error creating festival", error);
		return {
			success: false,
			message: "Failed to create festival",
		};
	}
}

export async function deleteFestival(festivalId: number) {
	try {
		await db.delete(festivals).where(eq(festivals.id, festivalId));
	} catch (error) {
		console.error("Error deleting festival:", error);
		return {
			success: false,
			message:
				"Error al eliminar el festival. Por favor verifica que no haya datos relacionados.",
		};
	}
	revalidatePath("/dashboard/festivals");
	updateTag("active-festival");
	return {
		success: true,
		message: "Festival eliminado correctamente!",
	};
}

export async function fetchActiveFestivalBase() {
	try {
		return await db.query.festivals.findFirst({
			where: eq(festivals.status, "active"),
		});
	} catch (error) {
		console.error("Error fetching active festival", error);
		return null;
	}
}

export async function updateFestival(
	data: Omit<typeof festivals.$inferInsert, "id"> & {
		id: number;
		dates?: Array<{
			id?: number;
			date: Date;
			startTime: string;
			endTime: string;
		}>;
		dateDetails?: Array<{
			startDate: Date;
			endDate: Date;
		}>;
		festivalSectors?: Array<{
			id?: number;
			name: string;
			orderInFestival: number;
			mapUrl?: string;
			mascotUrl?: string;
		}>;
		deletedSectorIds?: number[];
	},
) {
	try {
		const result = await db.transaction(async (tx) => {
			const [updatedFestival] = await tx
				.update(festivals)
				.set({
					name: data.name,
					description: data.description || null,
					address: data.address || null,
					locationLabel: data.locationLabel || null,
					locationUrl: data.locationUrl || null,
					status: data.status || "draft",
					mapsVersion: data.mapsVersion || "v1",
					publicRegistration: data.publicRegistration || false,
					eventDayRegistration: data.eventDayRegistration || false,
					festivalType: data.festivalType || "glitter",
					generalMapUrl: data.generalMapUrl || null,
					mascotUrl: data.mascotUrl || null,
					illustrationPaymentQrCodeUrl:
						data.illustrationPaymentQrCodeUrl || null,
					gastronomyPaymentQrCodeUrl: data.gastronomyPaymentQrCodeUrl || null,
					entrepreneurshipPaymentQrCodeUrl:
						data.entrepreneurshipPaymentQrCodeUrl || null,
					illustrationStandUrl: data.illustrationStandUrl || null,
					gastronomyStandUrl: data.gastronomyStandUrl || null,
					entrepreneurshipStandUrl: data.entrepreneurshipStandUrl || null,
					festivalCode: data.festivalCode || null,
					festivalBannerUrl: data.festivalBannerUrl || null,
					updatedAt: new Date(),
				})
				.where(eq(festivals.id, data.id))
				.returning();

			// Get existing dates to compare
			const existingDates = await tx
				.select()
				.from(festivalDates)
				.where(eq(festivalDates.festivalId, data.id));

			if (data.dateDetails && data.dateDetails.length > 0) {
				for (let i = 0; i < data.dateDetails.length; i++) {
					const dateItem = data.dateDetails[i];
					const originalDateItem = data.dates?.[i];

					if (originalDateItem?.id) {
						// Update existing date
						await tx
							.update(festivalDates)
							.set({
								startDate: dateItem.startDate,
								endDate: dateItem.endDate,
								updatedAt: new Date(),
							})
							.where(eq(festivalDates.id, originalDateItem.id));
					} else {
						await tx.insert(festivalDates).values({
							festivalId: data.id,
							startDate: dateItem.startDate,
							endDate: dateItem.endDate,
							updatedAt: new Date(),
							createdAt: new Date(),
						});
					}
				}
				// Delete dates that were removed
				const datesToKeep =
					(data.dates?.map((d) => d.id).filter(Boolean) as number[]) || [];
				const datesToDelete = existingDates
					.filter((d) => !datesToKeep.includes(d.id))
					.map((d) => d.id);

				if (datesToDelete.length > 0) {
					await tx
						.delete(festivalDates)
						.where(inArray(festivalDates.id, datesToDelete));
				}
			}
			if (data.festivalSectors) {
				for (const sector of data.festivalSectors) {
					if (sector.id) {
						await tx
							.update(festivalSectors)
							.set({
								name: sector.name,
								orderInFestival: sector.orderInFestival,
								mapUrl: sector.mapUrl || null,
								mascotUrl: sector.mascotUrl || null,
								updatedAt: new Date(),
							})
							.where(eq(festivalSectors.id, sector.id));
					} else {
						await tx.insert(festivalSectors).values({
							festivalId: data.id,
							name: sector.name,
							orderInFestival: sector.orderInFestival,
							mapUrl: sector.mapUrl || null,
							mascotUrl: sector.mascotUrl || null,
							createdAt: new Date(),
							updatedAt: new Date(),
						});
					}
				}
				if (data.deletedSectorIds && data.deletedSectorIds.length > 0) {
					await tx
						.delete(festivalSectors)
						.where(inArray(festivalSectors.id, data.deletedSectorIds));
				}
			}

			return updatedFestival;
		});

		revalidatePath("/dashboard/festivals");
		updateTag("active-festival");
		return {
			success: true,
			message: "Festival updated successfully",
			data: result,
		};
	} catch (error) {
		console.error("Error updating festival:", error);
		return {
			success: false,
			message: "Failed to update festival. Please try again.",
		};
	}
}

export async function fetchFestivalActivityForReview(
	festivalId: number,
	activityId: number,
) {
	try {
		return await db.query.festivalActivities.findFirst({
			where: and(
				eq(festivalActivities.festivalId, festivalId),
				eq(festivalActivities.id, activityId),
			),
			with: {
				details: {
					with: {
						participants: {
							with: {
								proofs: true,
								user: true,
							},
						},
					},
				},
			},
		});
	} catch (error) {
		console.error("Error fetching festival activity for review:", error);
		return null;
	}
}

export async function fetchCarouselFestivals(): Promise<FestivalWithDates[]> {
	"use cache";
	cacheLife("minutes");
	cacheTag("active-festival");

	try {
		return (await db.query.festivals.findMany({
			where: or(
				eq(festivals.status, "active"),
				eq(festivals.status, "published"),
			),
			with: { festivalDates: true },
			orderBy: desc(festivals.id),
		})) as FestivalWithDates[];
	} catch (error) {
		console.error("Error fetching carousel festivals", error);
		return [];
	}
}

export async function fetchFestivalActivitiesByFestivalId(festivalId: number) {
	try {
		return await db.query.festivalActivities.findMany({
			where: eq(festivalActivities.festivalId, festivalId),
		});
	} catch (error) {
		console.error("Error fetching festival activities by festival id", error);
		return [];
	}
}

export async function fetchFestivalWithDatesAndSectors(
	id: number,
): Promise<FestivalWithDatesAndSectors | null> {
	try {
		const festival = await db.query.festivals.findFirst({
			where: eq(festivals.id, id),
			with: {
				festivalDates: true,
				festivalSectors: true,
			},
		});

		return festival as FestivalWithDatesAndSectors | null;
	} catch (error) {
		console.error("Error fetching festival with dates and sectors", error);
		return null;
	}
}

export async function fetchActiveFestivalWithDates(): Promise<FestivalWithDates | null> {
	"use cache";
	cacheLife("minutes");
	cacheTag("active-festival");

	try {
		const festival = await db.query.festivals.findFirst({
			where: eq(festivals.status, "active"),
			with: {
				festivalDates: true,
			},
		});

		return festival as FestivalWithDates | null;
	} catch (error) {
		console.error("Error fetching active festival base", error);
		return null;
	}
}

export async function fetchFestival({
	acceptedUsersOnly = false,
	id,
}: {
	acceptedUsersOnly?: boolean;
	id?: number;
}): Promise<FullFestival | null | undefined> {
	const whereCondition = acceptedUsersOnly
		? { where: eq(userRequests.status, "accepted") }
		: {};

	const festivalWhereCondition = id
		? { where: eq(festivals.id, id) }
		: { where: eq(festivals.status, "active") };

	try {
		return await db.query.festivals.findFirst({
			...festivalWhereCondition,
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
					...whereCondition,
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
								votes: true,
							},
						},
					},
				},
			},
		});
	} catch (error) {
		console.error("Error fetching active festival", error);
		return null;
	}
}

export async function fetchFestivalWithTicketsAndDates(
	id: number,
): Promise<FestivalWithTicketsAndDates | null | undefined> {
	try {
		return await db.query.festivals.findFirst({
			where: eq(festivals.id, id),
			with: {
				festivalDates: true,
				tickets: {
					with: {
						visitor: true,
					},
				},
			},
		});
	} catch (error) {
		console.error("Error fetching active festival", error);
		return null;
	}
}

export async function fetchBaseFestival(
	id: number,
): Promise<FestivalBase | null | undefined> {
	try {
		return await db.query.festivals.findFirst({
			where: eq(festivals.id, id),
		});
	} catch (error) {
		console.error("Error fetching active festival", error);
		return null;
	}
}

export async function fetchFestivalWithDates(
	id: number,
): Promise<FestivalWithDates | null | undefined> {
	try {
		return await db.query.festivals.findFirst({
			with: {
				festivalDates: true,
			},
			where: eq(festivals.id, id),
		});
	} catch (error) {
		console.error("Error fetching active festival", error);
		return null;
	}
}

export async function fetchFestivals(): Promise<FestivalWithDates[]> {
	try {
		return await db.query.festivals.findMany({
			with: {
				festivalDates: true,
			},
			orderBy: desc(festivals.id),
		});
	} catch (error) {
		console.error("Error fetching festivals", error);
		return [];
	}
}

// TODO: Improve this by running actions in the background
// ------ BEGIN
export async function updateFestivalStatusTemp(festival: FestivalBase) {
	try {
		await db
			.update(festivals)
			.set({ status: festival.status })
			.where(eq(festivals.id, festival.id));
	} catch (error) {
		console.error(error);
		return { success: false, message: "Error al actualizar el festival" };
	}

	revalidatePath("/dashboard/festivals");
	updateTag("active-festival");
	return { success: true, message: "Festival actualizado con éxito" };
}

export async function getFestivalAvailableUsers(festivalId: number) {
	try {
		const sectors = await db.query.festivalSectors.findMany({
			with: {
				stands: true,
			},
			where: eq(festivalSectors.festivalId, festivalId),
		});

		const categories = [
			...new Set(
				sectors.flatMap((sector) =>
					getFestivalSectorAllowedCategories(sector, true),
				),
			),
		];

		return await db
			.select()
			.from(users)
			.where(
				and(eq(users.status, "verified"), inArray(users.category, categories)),
			);
	} catch (error) {
		console.error(error);
		return [];
	}
}
export async function sendUserEmailsTemp(
	users: BaseProfile[],
	festivalId: number,
) {
	try {
		const festivalWithDates = await fetchFestivalWithDates(festivalId);
		await queueEmails<BaseProfile>(users, festivalWithDates!, sendEmailToUsers);
	} catch (error) {}
}
// ------ END

export async function updateFestivalStatus(festival: FestivalBase) {
	try {
		const { status } = festival;
		const [updatedFestival] = await db
			.update(festivals)
			.set({ status })
			.where(eq(festivals.id, festival.id))
			.returning();

		const festivalWithDates = await fetchFestivalWithDates(updatedFestival.id);

		if (updatedFestival.status === "active") {
			const sectors = await db.query.festivalSectors.findMany({
				with: {
					stands: true,
				},
				where: eq(festivalSectors.festivalId, festival.id),
			});

			const categories = [
				...new Set(
					sectors.flatMap((sector) =>
						getFestivalSectorAllowedCategories(sector, true),
					),
				),
			];

			const result = await db
				.select()
				.from(users)
				.innerJoin(
					profileSubcategories,
					eq(users.id, profileSubcategories.profileId),
				)
				.where(
					and(
						eq(users.status, "verified"),
						inArray(users.category, categories),
					),
				);

			const availableUsers = result.map((result) => result.users);

			await queueEmails<BaseProfile>(
				availableUsers,
				festivalWithDates!,
				sendEmailToUsers,
			);
		}
	} catch (error) {
		console.error("Error activating festival", error);
		return { success: false, message: "Error al actualizar el festival" };
	}

	revalidatePath("/dashboard/festivals");
	updateTag("active-festival");
	return { success: true, message: "Festival actualizado con éxito" };
}

export async function updateFestivalRegistration(
	publicRegistrationValue: FestivalBase["publicRegistration"],
	festivalId: FestivalBase["id"],
) {
	try {
		const [updatedFestival] = await db
			.update(festivals)
			.set({ publicRegistration: publicRegistrationValue })
			.where(eq(festivals.id, festivalId))
			.returning({ festivalId: festivals.id });

		const festivalWithDates = await fetchFestivalWithDates(
			updatedFestival.festivalId,
		);

		const visitors = await fetchVisitorsEmails();
		const emailGroups = groupVisitorEmails(visitors);

		if (festivalWithDates?.publicRegistration) {
			await queueEmails<string[]>(
				emailGroups,
				festivalWithDates,
				sendEmailToVisitors,
			);
		}
	} catch (error) {
		console.error("Error updating festival registration", error);
		return { success: false, message: "Error al actualizar el festival" };
	}

	revalidatePath("/dashboard/festivals");
	updateTag("active-festival");
	return { success: true, message: "Festival actualizado con éxito" };
}

export async function queueEmails<T>(
	entities: T[],
	festival: FestivalWithDates,
	callback: (entity: T, festival: FestivalWithDates) => Promise<void>,
) {
	let counter = 0;
	for (const entity of entities) {
		if (counter % 10 === 0) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
		await callback(entity, festival);
		counter++;
	}
}

export async function sendEmailToVisitors(
	emails: string[],
	festival: FestivalWithDates,
) {
	const { error } = await sendEmail({
		to: "visitantes@productoraglitter.com",
		from: "Equipo Glitter <equipo@productoraglitter.com>",
		bcc: emails,
		subject: "Pre-registro abierto para nuestro próximo festival",
		react: RegistrationInvitationEmailTemplate({
			festival: festival,
		}) as React.ReactElement,
		// this might be preventing that the email is sent to all the visitors we need
		// so i'll comment it for now
		// headers: {
		// 	"X-Entity-Ref-ID": new Date().getTime().toString(),
		// },
		replyTo: "visitantes@productoraglitter.com",
	});
	if (error) {
		console.error("Error sending email to visitors", error);
	}
}

export async function sendEmailToUsers(
	user: BaseProfile,
	festival: FestivalWithDates,
) {
	const { error } = await sendEmail({
		to: [user.email],
		from: "Productora Glitter <eventos@productoraglitter.com>",
		subject: `¡Hola ${user.displayName || ""}! Te invitamos a participar en ${
			festival.name
		}`,
		react: EmailTemplate({
			profile: user,
			festival: festival,
		}) as React.ReactElement,
	});
	if (error) {
		console.error("Error sending email to users", error);
	}
}

export async function fetchAvailableArtistsInFestival(
	festivalId: number,
): Promise<BaseProfile[]> {
	try {
		const usersTableColumns = getTableColumns(users);
		return await db.transaction(async (tx) => {
			const festivalParticipantIds = await tx
				.select({ participantId: reservationParticipants.userId })
				.from(reservationParticipants)
				.leftJoin(
					standReservations,
					eq(standReservations.id, reservationParticipants.reservationId),
				)
				.where(eq(standReservations.festivalId, festivalId));

			const participantsWhereCondition = [
				eq(users.status, "verified"),
				inArray(users.category, ["illustration", "new_artist"]),
				not(eq(users.role, "admin")),
				eq(userRequests.status, "accepted"),
				eq(userRequests.festivalId, festivalId),
			];

			if (festivalParticipantIds.length > 0) {
				participantsWhereCondition.push(
					not(
						inArray(
							users.id,
							festivalParticipantIds.map(
								(participant) => participant.participantId,
							),
						),
					),
				);
			}

			return await tx
				.selectDistinctOn([users.id], usersTableColumns)
				.from(users)
				.leftJoin(userRequests, eq(userRequests.userId, users.id))
				.leftJoin(
					reservationParticipants,
					eq(reservationParticipants.userId, users.id),
				)
				.where(and(...participantsWhereCondition));
		});
	} catch (error) {
		console.error("Error fetching profiles in festival", error);
		return [];
	}
}

export async function fetchPotentialPartnersForFestival(
	festivalId: number,
	excludeUserId: number,
): Promise<(BaseProfile & { isEligible: boolean })[]> {
	try {
		const usersTableColumns = getTableColumns(users);
		return await db.transaction(async (tx) => {
			// Users who have any reservation for this festival (excluded entirely)
			const usersWithReservations = await tx
				.select({ userId: reservationParticipants.userId })
				.from(reservationParticipants)
				.leftJoin(
					standReservations,
					eq(standReservations.id, reservationParticipants.reservationId),
				)
				.where(eq(standReservations.festivalId, festivalId));

			const reservedUserIds = usersWithReservations
				.map((r) => r.userId)
				.filter((id): id is number => id !== null);

			// Users who have accepted T&C (enrolled in festival)
			const enrolledUsers = await tx
				.select({ userId: userRequests.userId })
				.from(userRequests)
				.where(
					and(
						eq(userRequests.festivalId, festivalId),
						eq(userRequests.status, "accepted"),
					),
				);

			const enrolledUserIds = new Set(enrolledUsers.map((e) => e.userId));

			const whereConditions: Parameters<typeof and>[0][] = [
				eq(users.status, "verified"),
				inArray(users.category, ["illustration", "new_artist"]),
				not(eq(users.role, "admin")),
				not(eq(users.id, excludeUserId)),
			];

			if (reservedUserIds.length > 0) {
				whereConditions.push(not(inArray(users.id, reservedUserIds)));
			}

			const allUsers = await tx
				.selectDistinctOn([users.id], usersTableColumns)
				.from(users)
				.where(and(...whereConditions));

			return allUsers.map((user) => ({
				...user,
				isEligible: enrolledUserIds.has(user.id),
			}));
		});
	} catch (error) {
		console.error("Error fetching potential partners for festival", error);
		return [];
	}
}

export async function fetchFestivalParticipants(
	festivalId: number,
	confirmedOnly = false,
): Promise<ParticipationWithParticipantWithInfractionsAndReservations[]> {
	const whereCondition = confirmedOnly
		? and(
				eq(standReservations.festivalId, festivalId),
				eq(standReservations.status, "accepted"),
			)
		: eq(standReservations.festivalId, festivalId);

	try {
		const participantsWithReservationsSubquery = db
			.select({ id: standReservations.id })
			.from(standReservations)
			.where(whereCondition);

		return await db.query.reservationParticipants.findMany({
			where: inArray(
				reservationParticipants.reservationId,
				participantsWithReservationsSubquery,
			),
			with: {
				user: {
					with: {
						infractions: {
							with: {
								type: true,
							},
						},
					},
				},
				reservation: {
					with: {
						stand: true,
						festival: true,
					},
				},
			},
		});
	} catch (error) {
		console.error("Error fetching festival participants", error);
		return [];
	}
}

/**
 * Fetch all participants that have enrolled in a festival
 * @param festivalId - The id of the festival
 * @returns An array of profiles
 */
export async function fetchEnrolledParticipants(
	festivalId: number,
): Promise<BaseProfile[]> {
	try {
		const participantsWithReservationsSubquery = db
			.select({ userId: reservationParticipants.userId })
			.from(reservationParticipants)
			.leftJoin(
				standReservations,
				eq(standReservations.id, reservationParticipants.reservationId),
			)
			.where(and(eq(standReservations.festivalId, festivalId)));

		const queryResult = await db
			.selectDistinctOn([userRequests.userId], {
				users: users,
			})
			.from(userRequests)
			.leftJoin(users, eq(users.id, userRequests.userId))
			.where(
				and(
					eq(userRequests.type, "festival_participation"),
					eq(userRequests.festivalId, festivalId),
					not(
						inArray(
							userRequests.userId,
							// --- SQL Query equivalent to the subquery
							// sql`(
							//   select participations.user_id from participations
							//   left join stand_reservations on participations.reservation_id = stand_reservations.id
							//   where stand_reservations.festival_id = ${festivalId} and stand_reservations.status != 'rejected'
							// )`,
							participantsWithReservationsSubquery,
						),
					),
				),
			);

		return queryResult
			.map((userRequest) => userRequest.users)
			.filter((user): user is NonNullable<typeof user> => user !== null);
	} catch (error) {
		console.error(error);
		return [];
	}
}

export async function fetchProfileEnrollmentInFestival(
	profileId: number,
	festivalId: number,
) {
	try {
		return await db.query.userRequests.findFirst({
			where: and(
				eq(userRequests.userId, profileId),
				eq(userRequests.festivalId, festivalId),
				eq(userRequests.type, "festival_participation"),
			),
		});
	} catch (error) {
		console.error("Error fetching profile enrollment in festival", error);
		return null;
	}
}
