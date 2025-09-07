"use server";

import { UserSanctionFull } from "@/app/lib/users/definitions";
import { db } from "@/db";
import { sanctions } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const findActiveUserSanctions = async (
	userId: number,
): Promise<UserSanctionFull[]> => {
	return await db.query.sanctions.findMany({
		where: and(eq(sanctions.userId, userId), eq(sanctions.active, true)),
		with: {
			infraction: {
				with: {
					festival: true,
					type: true,
				},
			},
		},
	});
};
