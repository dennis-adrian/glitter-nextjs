"use server";

import { UserRequest } from "@/app/api/user_requests/definitions";
import { db, pool } from "@/db";
import { userRequests, users, festivals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function fetchRequestsByUserId(userId: number) {
  const client = await pool.connect();

  try {
    const requests = await db.query.userRequests.findMany({
      where: eq(userRequests.userId, userId),
      with: {
        user: true,
        festival: true,
      },
    });

    return requests;
  } catch (error) {
    console.error("Error fetching user requests", error);
    return [];
  } finally {
    client.release();
  }
}

export async function updateUserRequest(id: number, data: UserRequest) {
  const client = await pool.connect();
  const { status, user } = data;
  const userRole = user.role;
  const newRole = status === "accepted" ? "artist" : "user";
  try {
    db.transaction(async (tx) => {
      await tx
        .update(userRequests)
        .set({ status, updatedAt: new Date() })
        .where(eq(userRequests.id, id));

      if (userRole !== "admin") {
        await tx
          .update(users)
          .set({ role: newRole, updatedAt: new Date() })
          .where(eq(users.id, data.userId));
      }
    });
  } catch (error) {
    console.error("Error updating user request", error);
    return { message: "Error updating user request" };
  } finally {
    client.release();
  }

  revalidatePath("/dashboard", "layout");
  return { success: true };
}

export async function fetchRequests(): Promise<UserRequest[]> {
  const client = await pool.connect();

  try {
    const requests = await db.query.userRequests.findMany({
      with: {
        user: true,
        festival: true,
      },
    });

    return requests;
  } catch (error) {
    console.error("Error fetching user requests", error);
    return [];
  } finally {
    client.release();
  }
}
