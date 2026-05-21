import { cache } from "react";
import { and, countDistinct, eq } from "drizzle-orm";

import { db } from "@/db";
import { reservationParticipants, standReservations } from "@/db/schema";
import type { BaseProfile } from "@/app/api/users/definitions";

const REQUIRED_DISTINCT_FESTIVALS = 3;
const REQUIRED_RESERVATIONS = 3;

export const canAuthorPosts = cache(
	async (profile: BaseProfile | null | undefined): Promise<boolean> => {
		if (!profile) return false;
		if (profile.role === "admin" || profile.role === "festival_admin") {
			return true;
		}

		const [row] = await db
			.select({
				festivalCount: countDistinct(standReservations.festivalId),
				reservationCount: countDistinct(standReservations.id),
			})
			.from(reservationParticipants)
			.innerJoin(
				standReservations,
				eq(reservationParticipants.reservationId, standReservations.id),
			)
			.where(
				and(
					eq(reservationParticipants.userId, profile.id),
					eq(standReservations.status, "accepted"),
				),
			);

		if (!row) return false;
		return (
			Number(row.festivalCount) >= REQUIRED_DISTINCT_FESTIVALS &&
			Number(row.reservationCount) >= REQUIRED_RESERVATIONS
		);
	},
);
