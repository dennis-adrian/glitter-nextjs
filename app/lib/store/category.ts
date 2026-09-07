import { z } from "zod";

/** Concrete catalog category. Client-safe: never import `db/schema` here. */
export type StoreCategory = "merch" | "supplies";
/** Admin scope: a concrete category or the whole store. */
export type StoreCategoryScope = "all" | StoreCategory;

export const STORE_CATEGORIES = ["merch", "supplies"] as const;
export const STORE_CATEGORY_SCOPES = ["all", "merch", "supplies"] as const;

export const storeCategorySchema = z.enum(["merch", "supplies"]);
export const storeCategoryScopeSchema = z
  .enum(["all", "merch", "supplies"])
  .catch("all");

export const STORE_CATEGORY_SCOPE_LABELS: Record<StoreCategoryScope, string> = {
  all: "Todos",
  merch: "Tiendita",
  supplies: "Mercadito de Insumos",
};

export const STORE_CATEGORY_BADGE_LABELS: Record<StoreCategory, string> = {
  merch: "Tiendita",
  supplies: "Insumos",
};

/** Short, filename-safe scope token used by CSV exports. */
export const STORE_CATEGORY_FILENAME_SUFFIXES: Record<
  StoreCategoryScope,
  string
> = {
  all: "todos",
  merch: "tiendita",
  supplies: "insumos",
};

export const STORE_CATEGORY_SCOPE_PARAM = "category";

/** Client-safe normalizer: unknown, missing or array values fall back to `all`. */
export function normalizeStoreCategoryScope(
  value: string | string[] | null | undefined,
): StoreCategoryScope {
  const first = Array.isArray(value) ? value[0] : value;
  return storeCategoryScopeSchema.parse(first ?? undefined);
}

/** Narrows a scope to a concrete category, or null for the whole store. */
export function toConcreteStoreCategory(
  scope: StoreCategoryScope,
): StoreCategory | null {
  return scope === "all" ? null : scope;
}

export function isStoreCategory(value: unknown): value is StoreCategory {
  return value === "merch" || value === "supplies";
}

export function getStoreCategoryScopeLabel(scope: StoreCategoryScope): string {
  return STORE_CATEGORY_SCOPE_LABELS[scope];
}

export function getStoreCategoryBadgeLabel(category: StoreCategory): string {
  return STORE_CATEGORY_BADGE_LABELS[category];
}

export function getStoreCategoryFilenameSuffix(
  scope: StoreCategoryScope,
): string {
  return STORE_CATEGORY_FILENAME_SUFFIXES[scope];
}

/**
 * Replaces only `category`, preserving every other parameter on the current
 * page. Callers pass the page's live search params.
 */
export function withStoreCategoryScope(
  params: URLSearchParams | string,
  scope: StoreCategoryScope,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (scope === "all") next.delete(STORE_CATEGORY_SCOPE_PARAM);
  else next.set(STORE_CATEGORY_SCOPE_PARAM, scope);
  return next;
}

/** Builds an href for `pathname` carrying only the active category. */
export function storeCategoryScopeHref(
  pathname: string,
  scope: StoreCategoryScope,
): string {
  if (scope === "all") return pathname;
  return `${pathname}?${STORE_CATEGORY_SCOPE_PARAM}=${scope}`;
}

/**
 * Supplies are restricted to verified accounts. Shared by the cart storefront
 * check and the authoritative transactional check in order creation.
 */
export const SUPPLIES_VERIFIED_MESSAGE =
  "Los insumos requieren una cuenta verificada.";
export const SUPPLIES_UNVERIFIED_CAUSE = "supplies_unverified";

export function isSuppliesPurchaseBlocked(
  storeCategory: string | null | undefined,
  userStatus: string | undefined,
): boolean {
  return storeCategory === "supplies" && userStatus !== "verified";
}
