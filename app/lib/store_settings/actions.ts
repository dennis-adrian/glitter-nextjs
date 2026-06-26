"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cache } from "react";
import { z } from "zod";

import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import {
  STORE_SECTIONS,
  type StoreSection,
  type StoreSettings,
  type UpdateStoreSettingsInput,
} from "./definitions";

const CLOSED_TITLE_MAX = 120;
const CLOSED_MESSAGE_MAX = 1000;

const updateStoreSettingsSchema = z.object({
  section: z.enum(["merch", "supplies"]),
  mode: z.enum(["auto", "open", "closed"]),
  closedTitle: z.string().max(CLOSED_TITLE_MAX).nullish(),
  closedMessage: z.string().max(CLOSED_MESSAGE_MAX).nullish(),
});

/**
 * Reads the settings row for a section, creating a default (`mode: "auto"`) row
 * the first time it's requested so we never have to seed it in a migration.
 * `onConflictDoNothing` keeps concurrent first reads from racing on the unique
 * `section` constraint.
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

    const inserted = await db
      .insert(storeSettings)
      .values({ section, mode: "auto" })
      .onConflictDoNothing({ target: storeSettings.section })
      .returning();

    if (inserted.length > 0) {
      return inserted[0];
    }

    // A concurrent request inserted the row first; read it back.
    const [row] = await db
      .select()
      .from(storeSettings)
      .where(eq(storeSettings.section, section))
      .limit(1);

    return row;
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
