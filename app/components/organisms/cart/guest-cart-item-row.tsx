"use client";

import { CartLineRowLayout } from "@/app/components/organisms/cart/cart-line-row-layout";
import { useCartContext } from "@/app/components/providers/cart-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import type { GuestStockValidationResult } from "@/app/lib/cart/actions";
import { GuestCartItem } from "@/app/lib/cart/definitions";
import {
  MAX_CART_LINE_QUANTITY,
  PLACEHOLDER_IMAGE_URLS,
} from "@/app/lib/constants";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import {
  getProductVariantImageUrl,
  getProductVariantStock,
  getVariantLabel,
} from "@/app/lib/products/variants";

type GuestCartItemRowProps = {
  item: GuestCartItem;
  stockIssue?: GuestStockValidationResult;
};

export default function GuestCartItemRow({
  item,
  stockIssue,
}: GuestCartItemRowProps) {
  const { removeGuestItem, updateGuestItemQuantity } = useCartContext();
  const variantLabel =
    item.productVariantLabel ?? getVariantLabel(item.variant);
  const productName = variantLabel
    ? `${item.product.name} (${variantLabel})`
    : item.product.name;

  const stockCap = Math.max(
    1,
    Math.min(
      MAX_CART_LINE_QUANTITY,
      getProductVariantStock(item.product, item.variant) ??
        MAX_CART_LINE_QUANTITY,
    ),
  );
  const sanitizedQuantity = Math.max(
    1,
    Math.min(MAX_CART_LINE_QUANTITY, Number(item.quantity) || 1),
  );
  const maxQty = Math.max(stockCap, sanitizedQuantity);
  const unitPrice = getProductPriceAtPurchase(item.product, item.variant);
  const subtotal = unitPrice * item.quantity;

  const imageUrl =
    getProductVariantImageUrl(item.product, item.variant) ??
    PLACEHOLDER_IMAGE_URLS["300"];

  return (
    <CartLineRowLayout
      imageUrl={imageUrl}
      productName={productName}
      unitPrice={unitPrice}
      subtotal={subtotal}
      warnings={
        <>
          {stockIssue?.isOutOfStock && (
            <span className="inline-block text-xs text-destructive font-medium mt-1">
              Sin stock
            </span>
          )}
          {!stockIssue?.isOutOfStock && stockIssue?.quantityExceedsStock && (
            <span className="inline-block text-xs text-amber-600 font-medium mt-1">
              Solo quedan {stockIssue.stock} disponibles
            </span>
          )}
          {!stockIssue &&
            getProductVariantStock(item.product, item.variant) === 0 && (
              <span className="inline-block text-xs text-destructive font-medium mt-1">
                Sin stock
              </span>
            )}
        </>
      }
      quantityControl={
        <Select
          value={String(sanitizedQuantity)}
          onValueChange={(v) =>
            updateGuestItemQuantity(item.lineKey, Number(v))
          }
        >
          <SelectTrigger
            className="h-7 w-16 text-sm"
            aria-label={`Cantidad de ${productName}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      onRemove={() => removeGuestItem(item.lineKey)}
    />
  );
}
