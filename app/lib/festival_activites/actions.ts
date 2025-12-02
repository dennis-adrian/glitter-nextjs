"use server";

import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { db } from "@/db";
import { festivalActivities, festivalActivityVotes } from "@/db/schema";
import { eq } from "drizzle-orm";

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

export const fetchFestivalActivityVotes = async (activityId: number) => {
	return await db.query.festivalActivityVotes.findMany({
		where: eq(festivalActivityVotes.activityId, activityId),
		with: {
			stand: true,
			participant: true,
		},
	});
};
