import type { BaseProductWithImages } from "@/app/lib/products/definitions";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { getProductEffectiveStock } from "@/app/lib/products/variants";
import type { MerchCollection } from "./definitions";

export function merchPrice(product: BaseProductWithImages) {
  const variants =
    product.variants?.filter((variant) => variant.isVisible) ?? [];
  return variants.length
    ? Math.min(
        ...variants.map((variant) =>
          getProductPriceAtPurchase(product, variant),
        ),
      )
    : getProductPriceAtPurchase(product);
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");

export function filterMerchCatalog(
  products: BaseProductWithImages[],
  collections: MerchCollection[],
  filters: {
    collection: string;
    query: string;
    sort: string;
    available: boolean;
  },
) {
  const collection = collections.find(
    (item) =>
      item.slug === filters.collection ||
      String(item.id) === filters.collection,
  );
  const query = normalize(filters.query.trim());
  return products
    .filter(
      (product) =>
        product.isVisible &&
        product.storeCategory === "merch" &&
        (!filters.collection ||
          !!collection?.productIds.includes(product.id)) &&
        (!query || normalize(product.name).includes(query)) &&
        (!filters.available ||
          (product.isPurchasable && getProductEffectiveStock(product) > 0)),
    )
    .sort((a, b) => {
      if (filters.sort === "price-asc")
        return merchPrice(a) - merchPrice(b) || a.id - b.id;
      if (filters.sort === "price-desc")
        return merchPrice(b) - merchPrice(a) || a.id - b.id;
      if (filters.sort !== "newest" && a.isFeatured !== b.isFeatured)
        return Number(b.isFeatured) - Number(a.isFeatured);
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        b.id - a.id
      );
    });
}
