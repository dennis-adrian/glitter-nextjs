"use server";

import { desc, eq } from "drizzle-orm";

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
        startDate?: Date;
        endDate?: Date;
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

            if (festivalData.startDate && festivalData.endDate) {
                await tx.insert(festivalDates)
                    .values({
                        festivalId: newFestival.id,
                        startDate: festivalData.startDate,
                        endDate: festivalData.endDate,
                        updatedAt: new Date(),
                        createdAt: new Date(),
                    });
            }

            return newFestival;
        });

        revalidatePath("/dashboard/festivals");
        return {
            success: true,
            message: "Festival created successfully",
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
        await db.transaction(async (tx) => {
            await tx.delete(festivalDates).where(eq(festivalDates.festivalId, festivalId));
            await tx.delete(userRequests).where(eq(userRequests.festivalId, festivalId));
            await tx.delete(standReservations).where(eq(standReservations.festivalId, festivalId));
            await tx.delete(tickets).where(eq(tickets.festivalId, festivalId));
            await tx.delete(festivalSectors).where(eq(festivalSectors.festivalId, festivalId));
            await tx.delete(festivalActivities).where(eq(festivalActivities.festivalId, festivalId));
            await tx.delete(festivals).where(eq(festivals.id, festivalId));
        });
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
        message: "Festival eliminado correctamente"
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

export async function updateFestival(data: {
    festival: Omit<FestivalWithDates, 'festivalDates'> & {
        description?: string | null;
        address?: string | null;
        locationLabel?: string | null;
        locationUrl?: string | null;
    };
    dates: {
        id?: number;
        festivalId: number;
        startDate: Date;
        endDate: Date;
    };
}) {
    try {
        const result = await db.transaction(async (tx) => {
          
            const [updatedFestival] = await tx
                .update(festivals)
                .set({
                    name: data.festival.name,
                    description: data.festival.description,
                    address: data.festival.address,
                    locationLabel: data.festival.locationLabel,
                    locationUrl: data.festival.locationUrl,
                    updatedAt: new Date(),
                })
                .where(eq(festivals.id, data.festival.id))
                .returning();

            
            if (data.dates.id) {
               
                await tx
                    .update(festivalDates)
                    .set({
                        startDate: data.dates.startDate,
                        endDate: data.dates.endDate,
                        updatedAt: new Date(),
                    })
                    .where(eq(festivalDates.id, data.dates.id));
            } else {
               
                await tx.insert(festivalDates).values({
                    festivalId: data.festival.id,
                    startDate: data.dates.startDate,
                    endDate: data.dates.endDate,
                    updatedAt: new Date(),
                    createdAt: new Date(),
                });
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