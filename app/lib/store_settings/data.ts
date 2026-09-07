import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import {
  STORE_SECTIONS,
  type StoreSection,
  type StoreSettings,
} from "./definitions";

/**
 * Reads the settings row for a section, creating a default (`mode: "auto"`) row
 * the first time it's requested so we never have to seed it in a migration.
 * `onConflictDoNothing` keeps concurrent first reads from racing on the unique
 * `section` constraint.
 *
 * Lives in a `server-only` data module (not the `use server` actions file) so it
 * isn't exposed as a callable server action.
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

/**
 * Returns every section's settings (creating any missing rows) in STORE_SECTIONS
 * order, which Promise.all preserves regardless of row-creation order.
 */
export async function fetchAllStoreSettings(): Promise<StoreSettings[]> {
  return Promise.all(
    STORE_SECTIONS.map((section) => fetchStoreSettings(section)),
  );
}
