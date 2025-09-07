import { db } from "@/db";
import { sanctions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const usersRepository = {
	findUserSanctions: async (userId: number) => {
		return await db.query.sanctions.findMany({
			where: eq(sanctions.userId, userId),
		});
	},
};
