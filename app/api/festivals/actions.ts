"use server";

import { asc, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { userRequests, festivals, stands } from "@/db/schema";
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
        stands: {
          orderBy: (stands.label, stands.standNumber),
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
