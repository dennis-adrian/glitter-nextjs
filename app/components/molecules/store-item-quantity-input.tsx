"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import SubmitProductOrderButton from "@/app/components/molecules/submit-product-order-button";
import StoreItemQuantityStepper from "@/app/components/molecules/store-item-quantity-stepper";
import RentalTransactionControls from "@/app/components/molecules/rental-transaction-controls";
import TransactionModeCards from "@/app/components/molecules/transaction-mode-cards";
import ProductContentSectionsDisplay from "@/app/components/molecules/product-content-sections-display";
import { useCartContext } from "@/app/components/providers/cart-provider";
import { Button } from "@/app/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { addToCart, fetchCartWithItems } from "@/app/lib/cart/actions";
import { buildCartLineKey } from "@/app/lib/cart/utils";
import { MAX_CART_LINE_QUANTITY } from "@/app/lib/constants";
import {
  getProductPriceAtPurchase,
  getRentalPriceAtPurchase,
} from "@/app/lib/orders/utils";
import {
  BaseProductWithImages,
  ProductOptionWithValues,
  ProductVariantWithSelections,
} from "@/app/lib/products/definitions";
import { filterContentSectionsForMode } from "@/app/lib/rentals/validation";
import type {
  ProductTransactionType,
  RentalEligibilityContext,
} from "@/app/lib/rentals/types";
import {
  getDefaultRentalReservationId,
  rentalContextIncludesReservation,
} from "@/app/lib/rentals/rental-context";
import {
  getAvailableStockForTransaction,
  getTransactionPoolRemainingStock,
} from "@/app/lib/rentals/stock";
import {
  getProductStoreAvailability,
  getProductVariantImageUrl,
  getVariantLabel,
} from "@/app/lib/products/variants";
import type { CartItemWithProduct } from "@/app/lib/cart/definitions";
import { cn } from "@/app/lib/utils";

type StoreItemQuantityInputProps = {
  product: BaseProductWithImages;
  compact?: boolean;
  onAdded?: () => void;
  onSelectedVariantChange?: (
    variant: ProductVariantWithSelections | null,
  ) => void;
  rentalEligible?: boolean;
  rentalContexts?: RentalEligibilityContext[];
  transactionType?: ProductTransactionType;
  onTransactionTypeChange?: (value: ProductTransactionType) => void;
  hideTransactionModeSelector?: boolean;
  selectedReservationId?: number | null;
  onSelectedReservationIdChange?: (reservationId: number) => void;
};

function variantHasSelection(
  variant: ProductVariantWithSelections,
  optionId: number,
  optionValueId: number,
): boolean {
  return variant.selections.some(
    (selection) =>
      selection.option.id === optionId &&
      selection.optionValue.id === optionValueId,
  );
}

function variantMatchesSelection(
  variant: ProductVariantWithSelections,
  selectedOptionValueIds: Record<number, number>,
): boolean {
  return Object.entries(selectedOptionValueIds).every(
    ([optionId, optionValueId]) =>
      variantHasSelection(variant, Number(optionId), optionValueId),
  );
}

function getInitialSelection(
  options: ProductOptionWithValues[],
  variant: ProductVariantWithSelections | null | undefined,
): Record<number, number> {
  const selected: Record<number, number> = {};

  for (const option of options) {
    const selectedValue =
      variant?.selections.find((selection) => selection.option.id === option.id)
        ?.optionValue ?? option.values[0];
    if (selectedValue) {
      selected[option.id] = selectedValue.id;
    }
  }

  return selected;
}

export default function StoreItemQuantityInput({
  product,
  compact = false,
  onAdded,
  onSelectedVariantChange,
  rentalEligible = false,
  rentalContexts = [],
  transactionType: controlledTransactionType,
  onTransactionTypeChange,
  hideTransactionModeSelector = false,
  selectedReservationId: controlledSelectedReservationId,
  onSelectedReservationIdChange,
}: StoreItemQuantityInputProps) {
  const { setItemCount, isAuthenticated, addGuestItem } = useCartContext();
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
  const defaultTransactionType: ProductTransactionType = canRent
    ? "rental"
    : canPurchase
      ? "purchase"
      : "purchase";
  const [internalTransactionType, setInternalTransactionType] =
    useState<ProductTransactionType>(defaultTransactionType);
  const isTransactionTypeControlled = controlledTransactionType !== undefined;
  const transactionType = isTransactionTypeControlled
    ? controlledTransactionType
    : internalTransactionType;
  const setTransactionType =
    onTransactionTypeChange ?? setInternalTransactionType;
  const [internalSelectedReservationId, setInternalSelectedReservationId] =
    useState<number | null>(() =>
      getDefaultRentalReservationId(rentalContexts),
    );
  const isSelectedReservationControlled =
    controlledSelectedReservationId !== undefined;
  const selectedReservationId = isSelectedReservationControlled
    ? controlledSelectedReservationId
    : internalSelectedReservationId;
  const setSelectedReservationId =
    onSelectedReservationIdChange ?? setInternalSelectedReservationId;
  const variants = useMemo(
    () => (product.variants ?? []).filter((variant) => variant.isVisible),
    [product.variants],
  );
  const options = useMemo(() => {
    const productOptions = product.options ?? [];
    return productOptions
      .map((option) => ({
        ...option,
        values: option.values.filter((value) =>
          variants.some((variant) =>
            variantHasSelection(variant, option.id, value.id),
          ),
        ),
      }))
      .filter((option) => option.values.length > 0);
  }, [product.options, variants]);
  const visibleVariantKey = useMemo(
    () => variants.map((variant) => variant.id).join(","),
    [variants],
  );
  const hasVariants = variants.length > 0;
  const [selectedOptionValueIds, setSelectedOptionValueIds] = useState<
    Record<number, number>
  >(() => (hasVariants ? getInitialSelection(options, variants[0]) : {}));
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [cartItems, setCartItems] = useState<CartItemWithProduct[]>([]);

  const loadCartItems = useCallback(async () => {
    if (!isAuthenticated) {
      setCartItems([]);
      return;
    }

    const result = await fetchCartWithItems();
    if (result.success && result.data) {
      setCartItems(result.data.items);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadCartItems();
  }, [loadCartItems, product.id]);

  useEffect(() => {
    setSelectedOptionValueIds(
      hasVariants ? getInitialSelection(options, variants[0]) : {},
    );
    setQuantity(1);
  }, [product.id, visibleVariantKey, options, hasVariants, variants]);

  useEffect(() => {
    if (!isSelectedReservationControlled) {
      setInternalSelectedReservationId(
        getDefaultRentalReservationId(rentalContexts),
      );
    }
  }, [product.id, rentalContexts, isSelectedReservationControlled]);

  const selectedVariant = hasVariants
    ? (variants.find((variant) =>
        variantMatchesSelection(variant, selectedOptionValueIds),
      ) ?? null)
    : null;

  const selectedVariantLabel = selectedVariant
    ? getVariantLabel(selectedVariant)
    : null;

  const poolRemaining = useMemo(() => {
    const rawStock = getAvailableStockForTransaction(
      product,
      selectedVariant,
      transactionType,
    );

    if (!isAuthenticated || cartItems.length === 0) {
      return rawStock;
    }

    const variantId = selectedVariant?.id ?? null;
    const siblingLines = cartItems
      .filter(
        (item) =>
          item.productId === product.id &&
          (item.productVariantId ?? null) === variantId,
      )
      .map((item) => ({
        id: item.id,
        productId: item.productId,
        productVariantId: item.productVariantId,
        transactionType: item.transactionType,
        quantity: item.quantity,
      }));

    const existingLine = siblingLines.find(
      (line) => line.transactionType === transactionType,
    );

    return getTransactionPoolRemainingStock(
      product,
      selectedVariant,
      transactionType,
      siblingLines,
      {
        id: existingLine?.id,
        productId: product.id,
        productVariantId: variantId,
      },
    );
  }, [cartItems, isAuthenticated, product, selectedVariant, transactionType]);

  const maxQuantity = Math.max(
    1,
    Math.min(MAX_CART_LINE_QUANTITY, poolRemaining),
  );
  const inStock = poolRemaining > 0;
  const unitPrice =
    transactionType === "rental"
      ? getRentalPriceAtPurchase(product)
      : getProductPriceAtPurchase(product, selectedVariant);
  const subtotal = unitPrice * quantity;
  const visibleSections = filterContentSectionsForMode(
    product.contentSections ?? [],
    transactionType === "rental" ? "rental" : "purchase",
    selectedVariant?.id ?? null,
  );
  const selectedRentalContext =
    rentalContexts.find((context) =>
      rentalContextIncludesReservation(context, selectedReservationId),
    ) ??
    rentalContexts[0] ??
    null;
  const purchaseCardPrice = selectedVariant
    ? getProductPriceAtPurchase(product, selectedVariant)
    : hasVariants
      ? Math.min(
          ...variants.map((variant) =>
            getProductPriceAtPurchase(product, variant),
          ),
        )
      : getProductPriceAtPurchase(product);
  const rentalCardPrice =
    product.rentalPrice != null ? getRentalPriceAtPurchase(product) : 0;
  const hideModeSelector = hideTransactionModeSelector || showDualMode;

  useEffect(() => {
    setQuantity((current) => Math.min(current, maxQuantity));
  }, [maxQuantity]);

  function clampQuantity(nextValue: number) {
    return Math.max(1, Math.min(maxQuantity, Math.trunc(nextValue) || 1));
  }

  function handleOptionValueChange(optionId: number, optionValueId: number) {
    const nextSelection = {
      ...selectedOptionValueIds,
      [optionId]: optionValueId,
    };
    setSelectedOptionValueIds(nextSelection);
    setQuantity(1);
    onSelectedVariantChange?.(
      variants.find((variant) =>
        variantMatchesSelection(variant, nextSelection),
      ) ?? null,
    );
  }

  function getImageVariantForOptionValue(
    optionId: number,
    optionValueId: number,
  ) {
    const exactMatch = variants.find((variant) =>
      variantMatchesSelection(variant, {
        ...selectedOptionValueIds,
        [optionId]: optionValueId,
      }),
    );
    if (exactMatch) return exactMatch;

    return (
      variants.find((variant) =>
        variantHasSelection(variant, optionId, optionValueId),
      ) ?? null
    );
  }

  async function handleAddToCart() {
    if (hasVariants && !selectedVariant) {
      toast.error("Selecciona una variante antes de continuar.");
      return;
    }

    const safeQuantity = clampQuantity(quantity);
    setSubmitting(true);
    try {
      if (transactionType === "rental") {
        if (!selectedRentalContext) {
          toast.error("Selecciona un festival para alquilar.");
          return;
        }

        const { success, newCount, message } = await addToCart({
          productId: product.id,
          productVariantId: selectedVariant?.id ?? null,
          quantity: safeQuantity,
          transactionType: "rental",
          rentalFestivalId: selectedRentalContext.festivalId,
          rentalReservationId: selectedRentalContext.reservationId,
        });

        if (success) {
          setItemCount(newCount);
          toast.success("Producto agregado al carrito de alquiler");
          await loadCartItems();
          onAdded?.();
        } else {
          toast.error(message ?? "No se pudo agregar al carrito");
        }
        return;
      }

      if (isAuthenticated) {
        const { success, newCount, message } = await addToCart({
          productId: product.id,
          productVariantId: selectedVariant?.id ?? null,
          quantity: safeQuantity,
          transactionType: "purchase",
        });

        if (success) {
          setItemCount(newCount);
          toast.success("Producto agregado al carrito");
          await loadCartItems();
          onAdded?.();
        } else {
          toast.error(message ?? "No se pudo agregar al carrito");
        }
      } else {
        addGuestItem({
          lineKey: buildCartLineKey(
            product.id,
            selectedVariant?.id ?? null,
            "purchase",
          ),
          productId: product.id,
          productVariantId: selectedVariant?.id ?? null,
          productVariantLabel: selectedVariantLabel,
          quantity: safeQuantity,
          product,
          variant: selectedVariant,
        });
        toast.success("Producto agregado al carrito");
        onAdded?.();
      }

      setQuantity(1);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      toast.error(`No se pudo agregar al carrito. ${message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`flex flex-col gap-4 ${compact ? "" : "mt-4"}`}>
      {showDualMode && (
        <TransactionModeCards
          transactionType={transactionType}
          onTransactionTypeChange={setTransactionType}
          purchasePrice={purchaseCardPrice}
          rentalPrice={rentalCardPrice}
          purchasePricePrefix={hasVariants ? "Desde " : ""}
          rentalContexts={rentalContexts}
          selectedReservationId={selectedReservationId}
          onSelectedReservationIdChange={setSelectedReservationId}
          selectedRentalContext={selectedRentalContext}
        />
      )}

      {canRent && (
        <RentalTransactionControls
          canPurchase={canPurchase}
          canRent={canRent}
          transactionType={transactionType}
          onTransactionTypeChange={setTransactionType}
          rentalContexts={rentalContexts}
          selectedReservationId={selectedReservationId}
          onSelectedReservationIdChange={setSelectedReservationId}
          hideModeSelector={hideModeSelector}
        />
      )}

      {visibleSections.length > 0 && (
        <ProductContentSectionsDisplay sections={visibleSections} />
      )}

      {hasVariants && (
        <div className="grid gap-4">
          {options.map((option) => (
            <div key={option.id} className="grid gap-2">
              <p className="text-sm font-medium">{option.name}</p>
              {option.selectorDisplay === "image" ? (
                <div className="flex flex-wrap gap-2">
                  {option.values.map((value) => {
                    const imageVariant = getImageVariantForOptionValue(
                      option.id,
                      value.id,
                    );
                    const imageUrl = getProductVariantImageUrl(
                      product,
                      imageVariant,
                    );
                    const isSelected =
                      selectedOptionValueIds[option.id] === value.id;

                    return (
                      <button
                        key={value.id}
                        type="button"
                        onClick={() => {
                          handleOptionValueChange(option.id, value.id);
                        }}
                        className={cn(
                          "relative h-16 w-16 overflow-hidden rounded-md border bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isSelected
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border hover:border-foreground/40",
                        )}
                        aria-label={value.value}
                        title={value.value}
                      >
                        {imageUrl ? (
                          <Image
                            src={imageUrl}
                            alt=""
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight text-muted-foreground">
                            {value.value}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : option.selectorDisplay === "button" ? (
                <div className="flex flex-wrap gap-2">
                  {option.values.map((value) => {
                    const isSelected =
                      selectedOptionValueIds[option.id] === value.id;

                    return (
                      <Button
                        key={value.id}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="min-h-10 whitespace-normal px-3 py-2 text-left leading-tight"
                        onClick={() => {
                          handleOptionValueChange(option.id, value.id);
                        }}
                      >
                        {value.value}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <Select
                  value={
                    selectedOptionValueIds[option.id] != null
                      ? String(selectedOptionValueIds[option.id])
                      : undefined
                  }
                  onValueChange={(value) => {
                    handleOptionValueChange(option.id, Number(value));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una opción" />
                  </SelectTrigger>
                  <SelectContent>
                    {option.values.map((value) => (
                      <SelectItem key={value.id} value={String(value.id)}>
                        {value.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>
      )}

      {inStock ? (
        <div className="flex items-stretch gap-3">
          <StoreItemQuantityStepper
            quantity={quantity}
            max={maxQuantity}
            onDecrease={() =>
              setQuantity((current) => clampQuantity(current - 1))
            }
            onIncrease={() =>
              setQuantity((current) => clampQuantity(current + 1))
            }
          />
          <SubmitProductOrderButton
            className="flex-1"
            disabled={
              submitting ||
              (hasVariants && !selectedVariant) ||
              (transactionType === "rental" && !selectedRentalContext)
            }
            loading={submitting}
            inStock={inStock}
            isPresale={product.status === "presale"}
            onClick={handleAddToCart}
            transactionType={transactionType}
            unitPrice={unitPrice}
            subtotal={subtotal}
          />
        </div>
      ) : (
        <SubmitProductOrderButton
          disabled={submitting}
          loading={submitting}
          inStock={false}
          isPresale={product.status === "presale"}
        />
      )}
    </div>
  );
}
