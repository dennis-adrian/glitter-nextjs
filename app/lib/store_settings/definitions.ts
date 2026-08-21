import { storeSettings } from "@/db/schema";
import { STORE_CATEGORIES, type StoreCategory } from "@/app/lib/store/category";

export type StoreSettings = typeof storeSettings.$inferSelect;
export type StoreStatusMode = StoreSettings["mode"];
/** Storefront-facing name for the shared {@link StoreCategory} value domain. */
export type StoreSection = StoreCategory;

export const STORE_SECTIONS: StoreSection[] = [...STORE_CATEGORIES];

export const STORE_SECTION_LABELS: Record<StoreSection, string> = {
  merch: "Mercha",
  supplies: "Mercadito de Insumos",
};

export type UpdateStoreSettingsInput = {
  section: StoreSection;
  mode: StoreStatusMode;
  closedTitle?: string | null;
  closedMessage?: string | null;
};
