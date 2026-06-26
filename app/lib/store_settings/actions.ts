"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cache } from "react";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import {
  STORE_SECTIONS,
  type StoreSection,
  type StoreSettings,
  type UpdateStoreSettingsInput,
} from "./definitions";

/**
 * Reads the settings row for a section, creating a default (`mode: "auto"`) row
 * the first time it's requested so we never have to seed it in a migration.
 */
export const fetchStoreSettings = cache(
  async (section: StoreSection): Promise<StoreSettings> => {
    const existing = await db
      .select()
      .from(storeSettings)
      .where(eq(storeSettings.section, section))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const [created] = await db
      .insert(storeSettings)
      .values({ section, mode: "auto" })
      .returning();

    return created;
  },
);

/** Returns every section's settings (creating any missing rows), ordered by id. */
export async function fetchAllStoreSettings(): Promise<StoreSettings[]> {
  const settings = await Promise.all(
    STORE_SECTIONS.map((section) => fetchStoreSettings(section)),
  );
  return settings.sort((a, b) => a.id - b.id);
}

export async function updateStoreSettings(input: UpdateStoreSettingsInput) {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return { success: false, message: "No autorizado" } as const;
  }

  const current = await fetchStoreSettings(input.section);

  await db
    .update(storeSettings)
    .set({
      mode: input.mode,
      closedTitle: input.closedTitle?.trim() || null,
      closedMessage: input.closedMessage?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(storeSettings.id, current.id));

  revalidatePath("/store", "layout");
  revalidatePath("/(storefront)", "layout");
  revalidatePath("/dashboard/store/settings");

  return { success: true, message: "Configuración actualizada" } as const;
}
