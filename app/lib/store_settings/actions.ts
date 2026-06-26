"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import { fetchStoreSettings } from "./data";
import { type UpdateStoreSettingsInput } from "./definitions";

const CLOSED_TITLE_MAX = 120;
const CLOSED_MESSAGE_MAX = 1000;

const updateStoreSettingsSchema = z.object({
  section: z.enum(["merch", "supplies"]),
  mode: z.enum(["auto", "open", "closed"]),
  closedTitle: z.string().max(CLOSED_TITLE_MAX).nullish(),
  closedMessage: z.string().max(CLOSED_MESSAGE_MAX).nullish(),
});

export async function updateStoreSettings(input: UpdateStoreSettingsInput) {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return { success: false, message: "No autorizado" } as const;
  }

  const parsed = updateStoreSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" } as const;
  }

  const { section, mode, closedTitle, closedMessage } = parsed.data;
  const current = await fetchStoreSettings(section);

  await db
    .update(storeSettings)
    .set({
      mode,
      closedTitle: closedTitle?.trim() || null,
      closedMessage: closedMessage?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(storeSettings.id, current.id));

  revalidatePath("/merch", "layout");
  revalidatePath("/supplies", "layout");
  revalidatePath("/checkout", "layout");
  revalidatePath("/dashboard/store/settings");

  return { success: true, message: "Configuración actualizada" } as const;
}
