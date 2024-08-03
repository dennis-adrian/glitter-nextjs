"use server";

import { NewUser } from "@/app/api/users/definitions";
import { db, pool } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function updateProfile(userId: number, profile: NewUser) {
  const client = await pool.connect();

  try {
    await db.update(users).set(profile).where(eq(users.id, userId));
  } catch (error) {
    console.error("Error updating profile", error);
    return {
      success: false,
      message: "Error al actualizar el perfil",
    };
  } finally {
    client.release();
  }

  return {
    success: true,
    message: "Perfil actualizado correctamente",
  };
}
