"use server";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import {
	ActivityConditionsConfig,
	ActivityUserCategory,
} from "@/app/lib/festival_activites/types";
import { db } from "@/db";
import {
	festivalActivities,
	festivalActivityDetails,
	festivalActivityParticipants,
} from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type FestivalActivityDetailInput = {
	/** Present for existing details, absent for new ones */
	id?: number;
	description?: string;
	participationLimit?: number;
	category?: ActivityUserCategory | null;
	conditions?: ActivityConditionsConfig | null;
};

export type FestivalActivityInput = {
	name: string;
	description?: string;
	visitorsDescription?: string;
	type: "stamp_passport" | "sticker_print" | "best_stand" | "festival_sticker";
	accessLevel: "public" | "festival_participants_only";
	promotionalArtUrl?: string;
	activityPrizeUrl?: string;
	registrationStartDate: Date;
	registrationEndDate: Date;
	requiresProof: boolean;
	proofUploadLimitDate?: Date;
	allowsVoting: boolean;
	votingStartDate?: Date;
	votingEndDate?: Date;
	conditions?: ActivityConditionsConfig | null;
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
					requiresProof: data.requiresProof,
					proofUploadLimitDate: data.proofUploadLimitDate,
					allowsVoting: data.allowsVoting,
					votingStartDate: data.votingStartDate,
					votingEndDate: data.votingEndDate,
					conditions: data.conditions ?? null,
				})
				.returning({ id: festivalActivities.id });

			await tx.insert(festivalActivityDetails).values(
				data.details.map((detail) => ({
					activityId: activity.id,
					description: detail.description,
					participationLimit: detail.participationLimit,
					category: detail.category ?? null,
					conditions: detail.conditions ?? null,
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
					requiresProof: data.requiresProof,
					proofUploadLimitDate: data.proofUploadLimitDate,
					allowsVoting: data.allowsVoting,
					votingStartDate: data.votingStartDate,
					votingEndDate: data.votingEndDate,
					conditions: data.conditions ?? null,
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

			// Delete details no longer in the payload — abort if participants exist
			const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
			for (const detailId of toDelete) {
				const [{ n }] = await tx
					.select({ n: count() })
					.from(festivalActivityParticipants)
					.where(eq(festivalActivityParticipants.detailsId, detailId));
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
						conditions: detail.conditions ?? null,
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
						conditions: detail.conditions ?? null,
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
