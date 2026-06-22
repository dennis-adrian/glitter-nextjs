"use client";

import { MinusIcon, PlusIcon } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import SubmitProductOrderButton from "@/app/components/molecules/submit-product-order-button";
import RentalTransactionControls from "@/app/components/molecules/rental-transaction-controls";
import ProductContentSectionsDisplay from "@/app/components/molecules/product-content-sections-display";
import { useCartContext } from "@/app/components/providers/cart-provider";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
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
import { getProductPriceAtPurchase, getRentalPriceAtPurchase } from "@/app/lib/orders/utils";
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
  getAvailableStockForTransaction,
  getTransactionPoolRemainingStock,
} from "@/app/lib/rentals/stock";
import {
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
}: StoreItemQuantityInputProps) {
  const { setItemCount, isAuthenticated, addGuestItem } = useCartContext();
  const canPurchase = product.isPurchasable;
  const canRent = product.isRentable && rentalEligible && isAuthenticated;
  const defaultTransactionType: ProductTransactionType = canPurchase
    ? "purchase"
    : canRent
      ? "rental"
      : "purchase";
  const [transactionType, setTransactionType] =
    useState<ProductTransactionType>(defaultTransactionType);
  const [selectedReservationId, setSelectedReservationId] = useState<
    number | null
  >(rentalContexts[0]?.reservationId ?? null);
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
  }, [
    cartItems,
    isAuthenticated,
    product,
    selectedVariant,
    transactionType,
  ]);

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
    rentalContexts.find(
      (context) => context.reservationId === selectedReservationId,
    ) ?? rentalContexts[0] ??
    null;

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
          toast.error("Selecciona un festival/reserva para alquilar.");
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
      {canRent && (
        <RentalTransactionControls
          canPurchase={canPurchase}
          canRent={canRent}
          transactionType={transactionType}
          onTransactionTypeChange={setTransactionType}
          rentalContexts={rentalContexts}
          selectedReservationId={selectedReservationId}
          onSelectedReservationIdChange={setSelectedReservationId}
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

      {inStock && (
        <div className="flex flex-col items-end gap-1 self-end">
          <p className="self-start text-sm font-medium">Cantidad</p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={() =>
                setQuantity((current) => clampQuantity(current - 1))
              }
              disabled={quantity <= 1}
            >
              <MinusIcon className="w-4 h-4" />
            </Button>
            <Input
              className="w-16"
              type="number"
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(event) =>
                setQuantity(clampQuantity(Number(event.target.value)))
              }
              onBlur={() => setQuantity((current) => clampQuantity(current))}
            />
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={() =>
                setQuantity((current) => clampQuantity(current + 1))
              }
              disabled={quantity >= maxQuantity}
            >
              <PlusIcon className="w-4 h-4" />
            </Button>
          </div>
          <span className="text-sm">
            Subtotal Bs{subtotal.toFixed(2)}
            {transactionType === "rental" ? " (alquiler)" : ""}
          </span>
        </div>
      )}

      <SubmitProductOrderButton
        disabled={
          submitting ||
          (hasVariants && !selectedVariant) ||
          (transactionType === "rental" && !selectedRentalContext)
        }
        loading={submitting}
        inStock={inStock}
        isPresale={product.status === "presale"}
        onClick={handleAddToCart}
        label={
          transactionType === "rental"
            ? "Alquilar"
            : product.status === "presale"
              ? "Reservar"
              : undefined
        }
      />
    </div>
  );
}
