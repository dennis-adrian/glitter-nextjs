"use client";

import { ClockIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import Heading from "@/app/components/atoms/heading";
import StoreItemQuantityInput from "@/app/components/molecules/store-item-quantity-input";
import StoreProductImages from "@/app/components/molecules/store-product-images";
import { useCartContext } from "@/app/components/providers/cart-provider";
import { formatDate } from "@/app/lib/formatters";
import {
  getProductPriceAtPurchase,
  getRentalPriceAtPurchase,
} from "@/app/lib/orders/utils";
import {
  BaseProductWithImages,
  ProductVariantWithSelections,
} from "@/app/lib/products/definitions";
import {
  getProductEffectiveRentalStock,
  getProductStoreAvailability,
  getProductVariantImageUrl,
} from "@/app/lib/products/variants";

type ProductDetailContentProps = {
  product: BaseProductWithImages;
  rentalEligible?: boolean;
  rentalContexts?: import("@/app/lib/rentals/types").RentalEligibilityContext[];
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
  rentalEligible = false,
  rentalContexts = [],
}: ProductDetailContentProps) {
  const { isAuthenticated } = useCartContext();
  const visibleVariants = useMemo(
    () => (product.variants ?? []).filter((variant) => variant.isVisible),
    [product.variants],
  );
  const isPresale = product.status === "presale";
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
    visibleVariants[0]?.id ?? null,
  );

  const hasVariants = visibleVariants.length > 0;
  const selectedVariant =
    visibleVariants.find((variant) => variant.id === selectedVariantId) ??
    visibleVariants[0] ??
    null;
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
      setSelectedVariantId(variant?.id ?? null);
    },
    [],
  );

  const { purchaseInStock, rentalInStock } = getProductStoreAvailability(
    product,
    rentalEligible,
  );
  const canPurchase = product.isPurchasable && purchaseInStock;
  const canRent =
    product.isRentable &&
    rentalEligible &&
    isAuthenticated &&
    rentalInStock &&
    product.rentalPrice != null;
  const showDualMode = canPurchase && canRent;
  // Ineligible viewers of a buy + rent product still see the side-by-side mode
  // cards (with rental disabled), so the heading should not also repeat the
  // purchase-only price.
  const showModeCards =
    showDualMode ||
    (canPurchase &&
      product.isRentable &&
      product.rentalPrice != null &&
      !rentalEligible);

  // Rental availability for display is independent of the viewer's eligibility,
  // so an available rentable product is not shown as out of stock to ineligible
  // viewers.
  const rentalDisplayAvailable =
    product.isRentable &&
    product.rentalPrice != null &&
    getProductEffectiveRentalStock(product) > 0;
  const imageStockSignal =
    purchaseInStock || rentalInStock || rentalDisplayAvailable ? 1 : 0;
  const rentalPrice = canRent ? getRentalPriceAtPurchase(product) : null;
  const showRentalOnlyPrice = canRent && !canPurchase;
  const showPurchaseOnlyPrice = canPurchase && !canRent;

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <StoreProductImages
        productName={product.name}
        stock={imageStockSignal}
        images={product.images}
        selectedImageUrl={selectedImageUrl}
      />

      <div className="flex flex-col gap-4 w-full">
        <Heading level={2}>{product.name}</Heading>

        {product.description && (
          <p className="text-muted-foreground text-sm leading-relaxed">
            {product.description}
          </p>
        )}

        {showModeCards ? null : showRentalOnlyPrice ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">
              Alquiler
            </span>
            <span className="text-3xl font-semibold">
              Bs{rentalPrice!.toFixed(2)}
            </span>
          </div>
        ) : showPurchaseOnlyPrice ? (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold">Bs{price.toFixed(2)}</span>
            {originalPrice && (
              <span className="text-base text-muted-foreground line-through">
                Bs{originalPrice.toFixed(2)}
              </span>
            )}
          </div>
        ) : null}

        {isPresale && (
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <ClockIcon className="w-4 h-4" />
            {product.availableDate
              ? `Disponible el ${formatDate(
                  product.availableDate,
                ).toLocaleString({
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}`
              : "Disponible próximamente"}
          </p>
        )}

        <StoreItemQuantityInput
          product={product}
          rentalEligible={rentalEligible}
          rentalContexts={rentalContexts}
          onSelectedVariantChange={handleSelectedVariantChange}
        />
      </div>
    </div>
  );
}
