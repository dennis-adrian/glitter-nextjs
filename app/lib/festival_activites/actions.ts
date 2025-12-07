"use server";

import { NewFestivalActivityVote } from "@/app/lib/festival_activites/definitions";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { db } from "@/db";
import {
	festivalActivities,
	festivalActivityVotes,
	reservationParticipants,
	standReservations,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
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

export const addFestivalActivityVote = async (vote: NewFestivalActivityVote) => {
	if (!vote.standId) {
		return {
			success: false,
			message: "El stand no existe",
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
