"use server";

import { eq } from "drizzle-orm";

import { pool, db } from "@/db";
import { festivals, standReservations, userRequests } from "@/db/schema";
import { ProfileWithParticipationsAndRequests } from "@/app/api/users/definitions";

type UserRequest = typeof userRequests.$inferSelect & {
  user: ProfileWithParticipationsAndRequests;
};
export type Festival = typeof festivals.$inferSelect & {
  userRequests: UserRequest[];
  standReservations: (typeof standReservations.$inferSelect)[];
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
            user: {
              with: {
                participations: {
                  with: {
                    reservation: true,
                  },
                },
                userRequests: true,
              },
            },
          },
          ...whereCondition,
        },
        standReservations: true,
      },
    });
  } catch (error) {
    console.error("Error fetching active festival", error);
    return null;
  } finally {
    client.release();
  }
}
