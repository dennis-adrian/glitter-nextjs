"use server";

import { db, pool } from "@/db";
import { userRequests, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type UserRequest = typeof userRequests.$inferSelect;

export async function updateUserRequest(
  id: number,
  data: UserRequest & { userRole: string },
) {
  const client = await pool.connect();
  const { status, userRole } = data;
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

  revalidatePath("/dashboard/users/[id]/requests");
  return { success: true };
}
