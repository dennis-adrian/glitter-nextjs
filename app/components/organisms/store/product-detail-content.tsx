"use client";

import { ClockIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import Heading from "@/app/components/atoms/heading";
import StoreItemQuantityInput from "@/app/components/molecules/store-item-quantity-input";
import StoreProductImages from "@/app/components/molecules/store-product-images";
import { formatDate } from "@/app/lib/formatters";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import {
  BaseProductWithImages,
  ProductVariantWithSelections,
} from "@/app/lib/products/definitions";
import {
  getProductEffectiveStock,
  getProductVariantImageUrl,
} from "@/app/lib/products/variants";

type ProductDetailContentProps = {
  product: BaseProductWithImages;
};

function getLowestVisibleVariantPrice(product: BaseProductWithImages) {
  const prices = (product.variants ?? [])
    .filter((variant) => variant.isVisible)
    .map((variant) => getProductPriceAtPurchase(product, variant));

  return prices.length > 0
    ? Math.min(...prices)
    : getProductPriceAtPurchase(product);
}

export default function ProductDetailContent({
  product,
}: ProductDetailContentProps) {
  const visibleVariants = useMemo(
    () => (product.variants ?? []).filter((variant) => variant.isVisible),
    [product.variants],
  );
  const [selectedVariant, setSelectedVariant] =
    useState<ProductVariantWithSelections | null>(visibleVariants[0] ?? null);

  const hasVariants = visibleVariants.length > 0;
  const price =
    hasVariants && selectedVariant
      ? getProductPriceAtPurchase(product, selectedVariant)
      : getLowestVisibleVariantPrice(product);
  const originalPrice =
    selectedVariant?.price == null &&
    product.discount &&
    Math.abs(product.price - price) > 0.001
      ? product.price
      : null;
  const selectedImageUrl = selectedVariant
    ? getProductVariantImageUrl(product, selectedVariant)
    : null;

  const handleSelectedVariantChange = useCallback(
    (variant: ProductVariantWithSelections | null) => {
      setSelectedVariant(variant);
    },
    [],
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
      <StoreProductImages
        productName={product.name}
        stock={getProductEffectiveStock(product)}
        images={product.images}
        selectedImageUrl={selectedImageUrl}
      />

      <div className="flex flex-col gap-4">
        <Heading level={2}>{product.name}</Heading>

        {product.description && (
          <p className="text-muted-foreground text-sm leading-relaxed">
            {product.description}
          </p>
        )}

        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold">Bs{price.toFixed(2)}</span>
          {originalPrice && (
            <span className="text-base text-muted-foreground line-through">
              Bs{originalPrice.toFixed(2)}
            </span>
          )}
        </div>

        {product.isPreOrder && product.availableDate && (
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <ClockIcon className="w-4 h-4" />
            Disponible el{" "}
            {formatDate(product.availableDate).toLocaleString({
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}

        <StoreItemQuantityInput
          product={product}
          onSelectedVariantChange={handleSelectedVariantChange}
        />
      </div>
    </div>
  );
}
