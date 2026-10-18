"use server";

import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { badges } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { NewBadge } from "./definitions";
import { asc } from "drizzle-orm";

export async function createBadge(badge: NewBadge) {
  const actor = await requireAdminOrFestivalAdmin();
  if (!actor) {
    return { success: false, message: "No autorizado" };
  }

  try {
    await db.insert(badges).values(badge);
  } catch (error) {
    console.error(error);
    return {
      success: false,
      message: "No se pudo crear la medalla.",
    };
  }

  revalidatePath("/dashboard/badges");
  return {
    success: true,
    message: "Medalla creada correctamente.",
  };
}

export async function fetchBadges() {
  try {
    return await db.query.badges.findMany({
      orderBy: [asc(badges.name)],
      with: {
        festival: true,
      },
    });
  } catch (error) {
    console.error(error);
    return [];
  }
}
