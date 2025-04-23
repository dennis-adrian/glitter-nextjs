"use server";

import { desc, eq, inArray } from "drizzle-orm";

import { db, pool } from "@/db";
import {
	userRequests,
	festivals,
	festivalDates,
	festivalSectors,
	festivalActivities,
	standReservations,
	tickets,
} from "@/db/schema";
import {
	FullFestival,
	FestivalBase,
	FestivalWithDates,
	FestivalWithTicketsAndDates,
} from "./definitions";
import { sendEmail } from "@/app/vendors/resend";
import React from "react";
import EmailTemplate from "@/app/emails/festival-activation";
import { revalidatePath } from "next/cache";
import {
	BaseProfile,
	ParticipationWithParticipantAndReservations,
} from "@/app/api/users/definitions";
import { fetchVisitorsEmails } from "@/app/data/visitors/actions";
import RegistrationInvitationEmailTemplate from "@/app/emails/registration-invitation";
import { groupVisitorEmails } from "@/app/data/festivals/helpers";
import { getFestivalSectorAllowedCategories } from "@/app/lib/festival_sectors/helpers";

export async function createFestival(
	festivalData: Omit<typeof festivals.$inferInsert, 'id'> & {
		dates?: Array<{
			date: Date;
			startTime: string;
			endTime: string;
		}>;
	}
) {
	try {
		const result = await db.transaction(async (tx) => {
			const [newFestival] = await tx.insert(festivals)
				.values({
					name: festivalData.name,
					description: festivalData.description || null,
					address: festivalData.address || null,
					locationLabel: festivalData.locationLabel || null,
					locationUrl: festivalData.locationUrl || null,
					status: festivalData.status || 'draft',
					mapsVersion: festivalData.mapsVersion || 'v1',
					publicRegistration: festivalData.publicRegistration || false,
					eventDayRegistration: festivalData.eventDayRegistration || false,
					festivalType: festivalData.festivalType || 'glitter',
					reservationsStartDate: festivalData.reservationsStartDate || new Date(),
					generalMapUrl: festivalData.generalMapUrl || null,
					mascotUrl: festivalData.mascotUrl || null,
					illustrationPaymentQrCodeUrl: festivalData.illustrationPaymentQrCodeUrl || null,
					gastronomyPaymentQrCodeUrl: festivalData.gastronomyPaymentQrCodeUrl || null,
					entrepreneurshipPaymentQrCodeUrl: festivalData.entrepreneurshipPaymentQrCodeUrl || null,
					illustrationStandUrl: festivalData.illustrationStandUrl || null,
					gastronomyStandUrl: festivalData.gastronomyStandUrl || null,
					entrepreneurshipStandUrl: festivalData.entrepreneurshipStandUrl || null,
					festivalCode: festivalData.festivalCode || null,
					festivalBannerUrl: festivalData.festivalBannerUrl || null,
					updatedAt: new Date(),
					createdAt: new Date(),
				})
				.returning();

			// Process and insert festival dates if they exist
			if (festivalData.dates && festivalData.dates.length > 0) {
				for (const dateItem of festivalData.dates) {
					// Parse the time strings (HH:MM)
					const [startHours, startMinutes] = dateItem.startTime.split(':').map(Number);
					const [endHours, endMinutes] = dateItem.endTime.split(':').map(Number);

					// Create new Date objects with the same date but different times
					const startDate = new Date(dateItem.date);
					startDate.setHours(startHours, startMinutes, 0, 0);

					const endDate = new Date(dateItem.date);
					endDate.setHours(endHours, endMinutes, 0, 0);

					// Insert the festival date
					await tx.insert(festivalDates).values({
						festivalId: newFestival.id,
						startDate,
						endDate,
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
			data: result
		};
	} catch (error) {
		console.error("Error creating festival", error);
		return {
			success: false,
			message: "Failed to create festival"
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
			message: "Error al eliminar el festival. Por favor verifica que no haya datos relacionados."
		};
	}
	revalidatePath("/dashboard/festivals");
	return {
		success: true,
		message: "Festival eliminado correctamente!"
	};
}

export async function fetchActiveFestivalBase() {
	const client = await pool.connect();

	try {
		return await db.query.festivals.findFirst({
			where: eq(festivals.status, "active"),
		});
	} catch (error) {
		console.error("Error fetching active festival", error);
		return null;
	} finally {
		client.release();
	}
}

export async function updateFestival(
  data: Omit<typeof festivals.$inferInsert, 'id'> & {
    id: number;
    dates?: Array<{
      id?: number;
      date: Date;
      startTime: string;
      endTime: string;
    }>;
  }
) {
  try {
    const result = await db.transaction(async (tx) => {
      // Update the festival
      const [updatedFestival] = await tx.update(festivals)
        .set({
          name: data.name,
          description: data.description || null,
          address: data.address || null,
          locationLabel: data.locationLabel || null,
          locationUrl: data.locationUrl || null,
          status: data.status || 'draft',
          mapsVersion: data.mapsVersion || 'v1',
          publicRegistration: data.publicRegistration || false,
          eventDayRegistration: data.eventDayRegistration || false,
          festivalType: data.festivalType || 'glitter',
          generalMapUrl: data.generalMapUrl || null,
          mascotUrl: data.mascotUrl || null,
          illustrationPaymentQrCodeUrl: data.illustrationPaymentQrCodeUrl || null,
          gastronomyPaymentQrCodeUrl: data.gastronomyPaymentQrCodeUrl || null,
          entrepreneurshipPaymentQrCodeUrl: data.entrepreneurshipPaymentQrCodeUrl || null,
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
      const existingDates = await tx.select()
        .from(festivalDates)
        .where(eq(festivalDates.festivalId, data.id));

      // Process dates if they exist
      if (data.dates && data.dates.length > 0) {
        for (const dateItem of data.dates) {
          // Parse the time strings (HH:MM)
          const [startHours, startMinutes] = dateItem.startTime.split(':').map(Number);
          const [endHours, endMinutes] = dateItem.endTime.split(':').map(Number);

          // Create new Date objects with the same date but different times
          const startDate = new Date(dateItem.date);
          startDate.setHours(startHours, startMinutes, 0, 0);

          const endDate = new Date(dateItem.date);
          endDate.setHours(endHours, endMinutes, 0, 0);

          if (dateItem.id) {
            // Update existing date
            await tx.update(festivalDates)
              .set({
                startDate,
                endDate,
                updatedAt: new Date(),
              })
              .where(eq(festivalDates.id, dateItem.id));
          } else {
            // Insert new date
            await tx.insert(festivalDates).values({
              festivalId: data.id,
              startDate,
              endDate,
              updatedAt: new Date(),
              createdAt: new Date(),
            });
          }
        }

        // Delete dates that were removed
        const datesToKeep = data.dates.map(d => d.id).filter(Boolean) as number[];
        const datesToDelete = existingDates
          .filter(d => !datesToKeep.includes(d.id))
          .map(d => d.id);

        if (datesToDelete.length > 0) {
          await tx.delete(festivalDates)
            .where(inArray(festivalDates.id, datesToDelete));
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
