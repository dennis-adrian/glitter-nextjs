"use client";

import Link from "next/link";
import { ClockIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import StoreItemQuantityInput from "@/app/components/molecules/store-item-quantity-input";
import StoreProductImages from "@/app/components/molecules/store-product-images";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { useCartContext } from "@/app/components/providers/cart-provider";
import { addToCart } from "@/app/lib/cart/actions";
import { buildCartLineKey } from "@/app/lib/cart/utils";
import { formatDate } from "@/app/lib/formatters";
import {
  getProductPriceAtPurchase,
  getRentalPriceAtPurchase,
} from "@/app/lib/orders/utils";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import type { RentalEligibilityContext } from "@/app/lib/rentals/types";
import {
  getProductEffectiveStock,
  getProductStoreAvailability,
  getVariantLabel,
} from "@/app/lib/products/variants";
import { ProductStatusBadge } from "@/components/molecules/ProductStatusBadge";

type StoreItemCardProps = {
  product: BaseProductWithImages;
  rentalEligible?: boolean;
  rentalContexts?: RentalEligibilityContext[];
};

function formatCardPrice(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
}

export default function StoreItemCard({
  product,
  rentalEligible = false,
  rentalContexts = [],
}: StoreItemCardProps) {
  const { setItemCount, isAuthenticated, addGuestItem } = useCartContext();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const variants = (product.variants ?? []).filter(
    (variant) => variant.isVisible,
  );
  const hasVariants = variants.length > 0;
  const shouldUseQuickAddModal = variants.length > 1;
  const singleVariant = variants.length === 1 ? variants[0] : null;
  const { purchaseInStock, rentalInStock, canTransact } =
    getProductStoreAvailability(product, rentalEligible);
  const inStock = canTransact;
  const isPresale = product.status === "presale";
  const isRentalOnly = rentalInStock && !purchaseInStock;
  const showDualMode =
    purchaseInStock &&
    rentalInStock &&
    product.isRentable &&
    rentalEligible &&
    isAuthenticated;
  const needsRentalContextPicker = isRentalOnly && rentalContexts.length > 1;
  const shouldOpenModal =
    shouldUseQuickAddModal || needsRentalContextPicker || showDualMode;

  const purchasePrices = hasVariants
    ? variants.map((variant) => ({
        current: getProductPriceAtPurchase(product, variant),
        original: variant.price ?? product.price,
      }))
    : [
        {
          current: getProductPriceAtPurchase(product),
          original: product.price,
        },
      ];

  const lowestPurchasePrice = Math.min(
    ...purchasePrices.map((entry) => entry.current),
  );
  const lowestPurchaseOriginal = Math.min(
    ...purchasePrices.map((entry) => entry.original),
  );
  const purchaseOriginalPrice =
    Math.abs(lowestPurchaseOriginal - lowestPurchasePrice) > 0.001
      ? lowestPurchaseOriginal
      : null;

  const showRentalPrice =
    product.isRentable &&
    rentalEligible &&
    rentalInStock &&
    product.rentalPrice != null;
  const showDualPricing = showRentalPrice && purchaseInStock;
  const rentalPrice = showRentalPrice
    ? getRentalPriceAtPurchase(product)
    : null;

  const quickAddLabel = !inStock
    ? "Agotado"
    : purchaseInStock
      ? "Agregar al carrito"
      : rentalInStock
        ? "Alquilar"
        : "Agregar al carrito";

  async function handleQuickAdd() {
    if (shouldOpenModal) {
      setQuickAddOpen(true);
      return;
    }

    const productVariantId = singleVariant?.id ?? null;
    setSubmitting(true);
    try {
      if (purchaseInStock) {
        if (isAuthenticated) {
          const { success, newCount, message } = await addToCart({
            productId: product.id,
            productVariantId,
            quantity: 1,
            transactionType: "purchase",
          });

          if (!success) {
            toast.error(message ?? "No se pudo agregar al carrito");
            return;
          }

          setItemCount(newCount);
        } else {
          addGuestItem({
            lineKey: buildCartLineKey(product.id, productVariantId),
            productId: product.id,
            productVariantId,
            productVariantLabel: singleVariant
              ? getVariantLabel(singleVariant)
              : null,
            quantity: 1,
            product,
            variant: singleVariant,
          });
        }

        toast.success("Producto agregado al carrito");
        return;
      }

      if (rentalInStock) {
        const [rentalContext] = rentalContexts;
        if (!rentalContext) {
          toast.error("Selecciona un festival para alquilar.");
          return;
        }

        const { success, newCount, message } = await addToCart({
          productId: product.id,
          productVariantId,
          quantity: 1,
          transactionType: "rental",
          rentalFestivalId: rentalContext.festivalId,
          rentalReservationId: rentalContext.reservationId,
        });

        if (!success) {
          toast.error(message ?? "No se pudo agregar al carrito de alquiler");
          return;
        }

        setItemCount(newCount);
        toast.success("Producto agregado al carrito de alquiler");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error desconocido";
      toast.error(`No se pudo agregar al carrito. ${message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Card className="group relative bg-card rounded-lg border border-border overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col">
        <Link
          href={`/store/products/${encodeURIComponent(product.slug)}`}
          className="flex-1 block"
        >
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
            <ProductStatusBadge
              status={product.status}
              discount={product.discount}
              discountUnit={product.discountUnit}
              stock={
                purchaseInStock
                  ? getProductEffectiveStock(product)
                  : rentalInStock
                    ? 1
                    : 0
              }
            />
          </div>

          <StoreProductImages
            productName={product.name}
            stock={inStock ? 1 : 0}
            images={product.images}
            interactive={false}
          />

          <CardContent className="p-3 flex flex-col gap-2">
            <p className="font-medium text-sm leading-tight line-clamp-2">
              {product.name}
            </p>

            {showRentalPrice ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Alquiler
                </span>
                <span className="text-lg font-bold leading-tight">
                  Bs{formatCardPrice(rentalPrice!)}
                </span>
                {showDualPricing && (
                  <p className="text-xs text-muted-foreground">
                    {hasVariants ? "o compralo desde " : "o compralo por "}
                    Bs{formatCardPrice(lowestPurchasePrice)}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className="font-semibold text-base">
                  {hasVariants ? "Desde " : ""}Bs
                  {formatCardPrice(lowestPurchasePrice)}
                </span>
                {purchaseOriginalPrice && (
                  <span className="text-xs text-muted-foreground line-through">
                    Bs{formatCardPrice(purchaseOriginalPrice)}
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Link>

        <div className="px-3 pb-3">
          <Button
            size="sm"
            className={
              inStock
                ? isPresale
                  ? "w-full bg-amber-600 hover:bg-amber-700"
                  : "w-full bg-primary hover:bg-primary/90"
                : "w-full bg-muted text-muted-foreground hover:bg-muted"
            }
            disabled={!inStock || submitting}
            onClick={handleQuickAdd}
            aria-label={`${quickAddLabel} ${product.name}`}
          >
            {!inStock ? (
              <span className="text-xs md:text-sm">Agotado</span>
            ) : submitting ? (
              <span className="text-xs md:text-sm">Agregando...</span>
            ) : (
              <span className="text-xs md:text-sm">{quickAddLabel}</span>
            )}
          </Button>
        </div>
      </Card>

      {shouldOpenModal && (
        <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{product.name}</DialogTitle>
              <DialogDescription>
                {showDualMode
                  ? "Selecciona cómo quieres obtener el producto."
                  : shouldUseQuickAddModal
                    ? "Selecciona una variante para agregarla al carrito."
                    : "Selecciona el festival para alquilar."}
              </DialogDescription>
            </DialogHeader>
            <StoreItemQuantityInput
              product={product}
              compact
              rentalEligible={rentalEligible}
              rentalContexts={rentalContexts}
              onAdded={() => setQuickAddOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
