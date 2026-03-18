"use server";

import { StandBase } from "@/app/api/stands/definitions";
import {
	BaseProfile,
	Participation,
	ParticipationType,
	UserCategory,
} from "@/app/api/users/definitions";
import { FullFestival } from "@/app/lib/festivals/definitions";
import {
	FestivalSectorWithStands,
	FestivalSectorWithStandsWithReservationsWithParticipants,
} from "@/app/lib/festival_sectors/definitions";
import { getFestivalSectorAllowedCategories } from "@/app/lib/festival_sectors/helpers";
import { db } from "@/db";
import {
	festivalActivityParticipants,
	festivals,
	festivalSectors,
	reservationParticipants,
	standReservations,
	stands,
	standSubcategories,
	users,
} from "@/db/schema";
import {
	and,
	eq,
	exists,
	inArray,
	isNull,
	notExists,
	or,
} from "drizzle-orm";
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
						standSubcategories: {
							with: { subcategory: true },
						},
					},
				},
				mapElements: true,
			},
			orderBy: festivalSectors.orderInFestival,
			where: eq(festivalSectors.festivalId, festivalId),
		});
	} catch (error) {
		console.error("Error fetching festival sectors", error);
		return [];
	}
}

export async function updateSectorMapBounds(
	sectorId: number,
	bounds: { minX: number; minY: number; width: number; height: number },
): Promise<{ success: boolean; message: string }> {
	if (
		!Number.isFinite(bounds.minX) ||
		!Number.isFinite(bounds.minY) ||
		!Number.isFinite(bounds.width) ||
		!Number.isFinite(bounds.height)
	) {
		return {
			success: false,
			message: "Dimensiones del mapa inválidas",
		};
	}

	try {
		const updated = await db
			.update(festivalSectors)
			.set({
				mapOriginX: bounds.minX,
				mapOriginY: bounds.minY,
				mapWidth: bounds.width,
				mapHeight: bounds.height,
				updatedAt: new Date(),
			})
			.where(eq(festivalSectors.id, sectorId))
			.returning({ id: festivalSectors.id });

		if (updated.length === 0) {
			return {
				success: false,
				message: "No se pudo actualizar las dimensiones del mapa",
			};
		}

		revalidatePath("/dashboard/festivals");
		revalidatePath("/", "layout");

		return { success: true, message: "Dimensiones del mapa actualizadas" };
	} catch (error) {
		console.error("Error updating sector map bounds", error);
		return {
			success: false,
			message: "Error al actualizar las dimensiones del mapa",
		};
	}
}

export async function fetchFestivalSectorsByUserCategory(
	festivalId: number,
	category: UserCategory,
	subcategoryIds: number[] = [],
	participationType: ParticipationType = "standard",
): Promise<FestivalSectorWithStandsWithReservationsWithParticipants[]> {
	try {
		return await db.transaction(async (tx) => {
			// A stand is visible if it has no subcategory restrictions, OR has a
			// restriction that matches one of the user's subcategories.
			const noRestrictions = notExists(
				tx
					.select()
					.from(standSubcategories)
					.where(eq(standSubcategories.standId, stands.id)),
			);
			const subcategoryFilter =
				subcategoryIds.length > 0
					? or(
							noRestrictions,
							exists(
								tx
									.select()
									.from(standSubcategories)
									.where(
										and(
											eq(standSubcategories.standId, stands.id),
											inArray(standSubcategories.subcategoryId, subcategoryIds),
										),
									),
							),
						)
					: noRestrictions;

			const sectorIds = await tx
				.selectDistinctOn([festivalSectors.id], {
					id: festivalSectors.id,
				})
				.from(festivalSectors)
				.leftJoin(festivals, eq(festivals.id, festivalSectors.festivalId))
				.leftJoin(stands, eq(stands.festivalSectorId, festivalSectors.id))
				.where(
					and(
						eq(festivals.id, festivalId),
						eq(stands.standCategory, category),
						eq(stands.participationType, participationType),
						subcategoryFilter,
					),
				);

			if (sectorIds.length === 0) return [];

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
							standSubcategories: {
								with: { subcategory: true },
							},
						},
					},
					mapElements: true,
				},
			});
		});
	} catch (error) {
		console.error("Error fetching festival sectors", error);
		return [];
	}
}

export async function fetchConfirmedProfilesByFestivalId(
	festivalId: number,
): Promise<
	(BaseProfile & { stands: StandBase[]; participations: Participation[] })[]
> {
	try {
		const res = await db
			.select()
			.from(users)
			.leftJoin(
				reservationParticipants,
				eq(reservationParticipants.userId, users.id),
			)
			.leftJoin(
				standReservations,
				eq(standReservations.id, reservationParticipants.reservationId),
			)
			.leftJoin(stands, eq(stands.id, standReservations.standId))
			.leftJoin(festivals, eq(festivals.id, standReservations.festivalId))
			.where(
				and(
					eq(standReservations.festivalId, festivalId),
					eq(standReservations.status, "accepted"),
				),
			);
		const userIds = Array.from(
			new Set(res.map((row) => row.users.id).filter(Boolean)),
		);

		if (userIds.length === 0) return [];

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
				eq(standReservations.id, reservationParticipants.reservationId),
			)
			.innerJoin(stands, eq(stands.id, standReservations.standId))
			.innerJoin(festivals, eq(festivals.id, standReservations.festivalId))
			.where(
				and(
					inArray(reservationParticipants.userId, userIds),
					eq(standReservations.status, "accepted"),
				),
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
		const profilesObject = res.reduce(
			(acc, row) => {
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
			},
			{} as Record<
				number,
				BaseProfile & { stands: StandBase[]; participations: Participation[] }
			>,
		);

		return Object.values(profilesObject);
	} catch (error) {
		console.error("Error fetching confirmed profiles", error);
		return [];
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
								votes: true,
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

export async function fetchSectorWithStandsAndReservations(sectorId: number) {
	try {
		return await db.query.festivalSectors.findFirst({
			where: eq(festivalSectors.id, sectorId),
			with: {
				stands: {
					with: {
						reservations: {
							with: { participants: { with: { user: true } } },
						},
					},
				},
			},
		});
	} catch (error) {
		console.error("Error fetching sector with stands and reservations", error);
		return null;
	}
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
