"use server";

import { eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { userRequests } from "@/db/schema";
import { Festival } from "./definitions";

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
        stands: true,
      },
    });
  } catch (error) {
    console.error("Error fetching active festival", error);
    return null;
  } finally {
    client.release();
  }
}
