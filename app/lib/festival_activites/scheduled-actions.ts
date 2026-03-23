"use server";

import { db } from "@/db";
import { festivalActivityWaitlist } from "@/db/schema";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { promoteFromWaitlist } from "@/app/lib/festival_activites/actions";

export async function processExpiredWaitlistNotifications() {
	const now = new Date();

	const expired = await db
		.select({
			id: festivalActivityWaitlist.id,
			activityId: festivalActivityWaitlist.activityId,
			notifiedForDetailId: festivalActivityWaitlist.notifiedForDetailId,
			notifiedAt: festivalActivityWaitlist.notifiedAt,
			expiresAt: festivalActivityWaitlist.expiresAt,
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
			await db.transaction(async (tx) => {
				if (!entry.expiresAt || !entry.notifiedAt) {
					return;
				}

				const [updated] = await tx
					.delete(festivalActivityWaitlist)
					.where(
						and(
							eq(festivalActivityWaitlist.id, entry.id),
							eq(festivalActivityWaitlist.activityId, entry.activityId),
							entry.notifiedForDetailId === null
								? isNull(festivalActivityWaitlist.notifiedForDetailId)
								: eq(
										festivalActivityWaitlist.notifiedForDetailId,
										entry.notifiedForDetailId,
									),
							eq(festivalActivityWaitlist.notifiedAt, entry.notifiedAt),
							eq(festivalActivityWaitlist.expiresAt, entry.expiresAt),
						),
					)
					.returning({ id: festivalActivityWaitlist.id });

				if (updated && entry.notifiedForDetailId) {
					await promoteFromWaitlist(
						entry.activityId,
						entry.notifiedForDetailId,
					);
				}
			});

			processed++;
		} catch (error) {
			console.error("Error processing expired waitlist entry", entry.id, error);
		}
	}

	return { processed };
}
