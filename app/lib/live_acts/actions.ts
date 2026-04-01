"use server";

import { db } from "@/db";
import { liveActs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { LiveAct, LiveActStatus, NewLiveAct } from "./definitions";

export async function createLiveAct(
  data: NewLiveAct,
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.insert(liveActs).values(data);
  } catch (error) {
    console.error("Error creating live act", error);
    return { success: false, error: "Error al enviar la postulación" };
  }

  return { success: true };
}

export async function fetchLiveActs(): Promise<LiveAct[]> {
  try {
    return db.select().from(liveActs).orderBy(desc(liveActs.createdAt));
  } catch (error) {
    console.error("Error fetching live acts", error);
    return [];
  }
}

export async function updateLiveActStatus(
  id: number,
  status: LiveActStatus,
): Promise<{ success: boolean; message: string }> {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return { success: false, message: "No tenés permisos para realizar esta acción" };
  }

  try {
    await db
      .update(liveActs)
      .set({ status, updatedAt: new Date() })
      .where(eq(liveActs.id, id));
  } catch (error) {
    console.error("Error updating live act status", error);
    return { success: false, message: "Error al actualizar el estado" };
  }

  revalidatePath("/dashboard/live-acts");
  return { success: true, message: "Estado actualizado correctamente" };
}

export async function updateLiveActAdminNotes(
  id: number,
  notes: string,
): Promise<{ success: boolean; message: string }> {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return { success: false, message: "No tenés permisos para realizar esta acción" };
  }

  try {
    await db
      .update(liveActs)
      .set({ adminNotes: notes, updatedAt: new Date() })
      .where(eq(liveActs.id, id));
  } catch (error) {
    console.error("Error updating live act admin notes", error);
    return { success: false, message: "Error al guardar las notas" };
  }

  revalidatePath("/dashboard/live-acts");
  return { success: true, message: "Notas guardadas correctamente" };
}
