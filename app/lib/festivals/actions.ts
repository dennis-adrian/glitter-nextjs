"use server";

import { and, desc, eq, inArray, isNull, not, sql } from "drizzle-orm";
import { db } from "@/db";
import { festivalDates, userRequests, festivals, users, reservationParticipants, festivalSectors, standReservations, profileSubcategories, tickets, userSocials, festivalActivities } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { FullFestival, Festival, FestivalBase, FestivalWithDates, FestivalWithTicketsAndDates, FestivalWithDatesAndSectors } from "./definitions";
import { fetchVisitorsEmails } from "@/app/data/visitors/actions";
import { sendEmail } from "@/app/vendors/resend";
import RegistrationInvitationEmailTemplate from "@/app/emails/registration-invitation";
import { BaseProfile, ParticipationWithParticipantAndReservations } from "@/app/api/users/definitions";
import EmailTemplate from "@/app/emails/festival-activation";
import { getFestivalSectorAllowedCategories } from "@/app/lib/festival_sectors/helpers";
import { groupVisitorEmails } from "./utils";

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
			if (festivalData.festivalSectors && festivalData.festivalSectors.length > 0) {
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
	}
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
						await tx.update(festivalSectors)
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
					await tx.delete(festivalSectors)
						.where(inArray(festivalSectors.id, data.deletedSectorIds));
				}
			}

			return updatedFestival;
		});

		revalidatePath("/dashboard/festivals");
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
