import {
  BaseProduct,
  BaseProductWithImages,
  ProductVariantWithSelections,
} from "@/app/lib/products/definitions";

export function productHasVariants(
  product: Pick<BaseProductWithImages, "variants">,
): boolean {
  return (product.variants?.length ?? 0) > 0;
}

export function getVariantLabel(
  variant: Pick<ProductVariantWithSelections, "selections"> | null | undefined,
): string | null {
  if (!variant || variant.selections.length === 0) return null;

  return [...variant.selections]
    .sort(
      (a, b) =>
        a.option.sortOrder - b.option.sortOrder ||
        a.optionValue.sortOrder - b.optionValue.sortOrder ||
        a.option.id - b.option.id,
    )
    .map(
      (selection) => `${selection.option.name}: ${selection.optionValue.value}`,
    )
    .join(" / ");
}

export function getProductVariantLabel(
  product: Pick<BaseProductWithImages, "variants">,
  variantId: number | null | undefined,
): string | null {
  if (variantId == null) return null;
  const variant = product.variants?.find((entry) => entry.id === variantId);
  return getVariantLabel(variant);
}

export function getProductEffectiveStock(
  product: Pick<BaseProductWithImages, "stock" | "variants">,
): number {
  if (!productHasVariants(product)) {
    return product.stock ?? 0;
  }

  return (product.variants ?? [])
    .filter((variant) => variant.isVisible)
    .reduce((sum, variant) => sum + Math.max(variant.stock ?? 0, 0), 0);
}

export function getProductVariantStock(
  product: Pick<BaseProduct, "stock">,
  variant: Pick<ProductVariantWithSelections, "stock"> | null | undefined,
): number {
  if (!variant) return product.stock ?? 0;
  return variant.stock ?? 0;
}

export function getProductVariantImageUrl(
  product: Pick<BaseProductWithImages, "images">,
  variant: Pick<ProductVariantWithSelections, "imageUrl"> | null | undefined,
): string | null {
  if (variant?.imageUrl) return variant.imageUrl;

  const mainImage = product.images.find((image) => image.isMain);
  return mainImage?.imageUrl ?? product.images[0]?.imageUrl ?? null;
}
