import { fetchPublicMerchCollection } from "./collections";
import { merchCollectionPath } from "./paths";

type ReturnLink = { href: string; label: string };

const fallback: ReturnLink = {
  href: "/merch",
  label: "Volver a la tienda",
};
const origin = "https://glitter.invalid";
const collectionPath =
  /^\/merch\/collections\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;
const sorts = new Set(["featured", "newest", "price-asc", "price-desc"]);

export async function resolveMerchProductReturn(
  productId: number,
  rawReturnTo: string | string[] | undefined,
): Promise<ReturnLink> {
  if (
    typeof rawReturnTo !== "string" ||
    !rawReturnTo.startsWith("/") ||
    rawReturnTo.length > 1000
  )
    return fallback;

  let url: URL;
  try {
    url = new URL(rawReturnTo, origin);
  } catch {
    return fallback;
  }
  if (url.origin !== origin) return fallback;

  const filters = new URLSearchParams();
  const query = url.searchParams.get("q")?.trim();
  const sort = url.searchParams.get("sort");
  if (query && query.length <= 200) filters.set("q", query);
  if (sort && sorts.has(sort)) filters.set("sort", sort);
  if (url.searchParams.get("available") === "1") filters.set("available", "1");
  const suffix = `${filters.size ? `?${filters}` : ""}#catalogo`;

  if (url.pathname === "/merch")
    return { href: `/merch${suffix}`, label: fallback.label };

  const slug = collectionPath.exec(url.pathname)?.[1];
  if (!slug) return fallback;
  const collection = await fetchPublicMerchCollection(slug);
  if (!collection?.productIds.includes(productId)) return fallback;
  return {
    href: `${merchCollectionPath(collection.slug)}${suffix}`,
    label: `Volver a ${collection.name}`,
  };
}
