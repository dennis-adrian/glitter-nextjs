import { ReservationBase } from "@/app/api/reservations/definitions";
import { ErrorCodes } from "@/app/lib/errors/codes";
import { db } from "@/db";
import { standReservations } from "@/db/schema";
import { and, DrizzleError, eq, not } from "drizzle-orm";

async function findBlockingReservations(
	standId: number,
): Promise<ReservationBase[]> {
	try {
		return await db.query.standReservations.findMany({
			where: and(
				eq(standReservations.standId, standId),
				not(eq(standReservations.status, "rejected")),
			),
		});
	} catch (e) {
		const drizzleError = e as DrizzleError;
		if (drizzleError.cause) {
			const errorCause = drizzleError.cause as {
				code?: string;
			};

			if (errorCause.code === "ECONNREFUSED") {
				throw new Error(ErrorCodes.DB_CONNECTION_ERROR);
			}
		}

		throw e;
	}
}

export const reservationsRepository = {
	findBlockingReservations,
};
