"use server";

import { db } from "@/db";
import { festivalActivityWaitlist } from "@/db/schema";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { promoteFromWaitlist } from "@/app/lib/festival_activites/actions";

export async function processExpiredWaitlistNotifications() {
	const now = new Date();

	const expired = await db
		.select({
			id: festivalActivityWaitlist.id,
			activityId: festivalActivityWaitlist.activityId,
			notifiedForDetailId: festivalActivityWaitlist.notifiedForDetailId,
		})
		.from(festivalActivityWaitlist)
		.where(
			and(
				isNotNull(festivalActivityWaitlist.notifiedAt),
				isNotNull(festivalActivityWaitlist.expiresAt),
				lt(festivalActivityWaitlist.expiresAt, now),
			),
		);

	let processed = 0;

	for (const entry of expired) {
		try {
			await db
				.update(festivalActivityWaitlist)
				.set({ expiresAt: null, updatedAt: new Date() })
				.where(eq(festivalActivityWaitlist.id, entry.id));

			if (entry.notifiedForDetailId) {
				await promoteFromWaitlist(entry.activityId, entry.notifiedForDetailId);
			}

			processed++;
		} catch (error) {
			console.error("Error processing expired waitlist entry", entry.id, error);
		}
	}

	return { processed };
}
