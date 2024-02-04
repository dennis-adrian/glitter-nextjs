"use server";

import { eq } from "drizzle-orm";

import { pool, db } from "@/db";
import { festivals, userRequests } from "@/db/schema";
import { UserRequest } from "@/app/api/user_requests/definitions";

export type Festival = typeof festivals.$inferSelect & {
  userRequests: Omit<UserRequest, "festival">[];
};
export async function fetchActiveFestival({
  acceptedUsersOnly = false,
}: {
  acceptedUsersOnly?: boolean;
}): Promise<Festival | null | undefined> {
  const client = await pool.connect();

  const whereCondition = acceptedUsersOnly
    ? { where: eq(userRequests.status, "accepted") }
    : {};
  try {
    return await db.query.festivals.findFirst({
      where: eq(festivals.status, "active"),
      with: {
        userRequests: {
          with: {
            user: true,
          },
          ...whereCondition,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching active festival", error);
    return null;
  } finally {
    client.release();
  }
}
