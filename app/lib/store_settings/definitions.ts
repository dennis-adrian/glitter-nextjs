import { storeSettings } from "@/db/schema";

export type StoreSettings = typeof storeSettings.$inferSelect;
export type StoreStatusMode = StoreSettings["mode"];
export type StoreSection = StoreSettings["section"];

export const STORE_SECTIONS: StoreSection[] = ["merch", "supplies"];

export const STORE_SECTION_LABELS: Record<StoreSection, string> = {
  merch: "Mercha",
  supplies: "Insumos",
};

export type UpdateStoreSettingsInput = {
  section: StoreSection;
  mode: StoreStatusMode;
  closedTitle?: string | null;
  closedMessage?: string | null;
};
