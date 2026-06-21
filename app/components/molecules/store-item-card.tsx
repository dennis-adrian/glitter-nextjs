"use client";

import Link from "next/link";
import { ClockIcon } from "lucide-react";
import { useState } from "react";

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
import { formatDate } from "@/app/lib/formatters";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import { getProductEffectiveStock } from "@/app/lib/products/variants";
import { ProductStatusBadge } from "@/components/molecules/ProductStatusBadge";

type StoreItemCardProps = {
  product: BaseProductWithImages;
};

export default function StoreItemCard({ product }: StoreItemCardProps) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const variants = (product.variants ?? []).filter(
    (variant) => variant.isVisible,
  );
  const hasVariants = variants.length > 0;
  const inStock = getProductEffectiveStock(product) > 0;
  const isPresale = product.status === "presale";

  const effectivePrices = hasVariants
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

  const lowestCurrentPrice = Math.min(
    ...effectivePrices.map((entry) => entry.current),
  );
  const lowestOriginalPrice = Math.min(
    ...effectivePrices.map((entry) => entry.original),
  );
  const originalPrice =
    Math.abs(lowestOriginalPrice - lowestCurrentPrice) > 0.001
      ? lowestOriginalPrice
      : null;

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
              stock={getProductEffectiveStock(product)}
            />
          </div>

          <StoreProductImages
            productName={product.name}
            stock={getProductEffectiveStock(product)}
            images={product.images}
            interactive={false}
            autoPlay={true}
          />

          <CardContent className="p-3 flex flex-col gap-2">
            <p className="font-medium text-sm leading-tight line-clamp-2">
              {product.name}
            </p>

            <div className="flex items-baseline gap-1.5">
              <span className="font-semibold text-base">
                {hasVariants ? "Desde " : ""}Bs{lowestCurrentPrice.toFixed(2)}
              </span>
              {originalPrice && (
                <span className="text-xs text-muted-foreground line-through">
                  Bs{originalPrice.toFixed(2)}
                </span>
              )}
            </div>

            {isPresale && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ClockIcon className="w-3 h-3" />
                {product.availableDate
                  ? formatDate(product.availableDate).toLocaleString({
                      month: "short",
                      day: "numeric",
                    })
                  : "Disponible próximamente"}
              </p>
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
                  : "w-full bg-purple-600 hover:bg-purple-700"
                : "w-full bg-muted text-muted-foreground hover:bg-muted"
            }
            disabled={!inStock}
            onClick={() => setQuickAddOpen(true)}
            aria-label={`${hasVariants ? "Elegir opcion para" : "Agregar"} ${product.name}`}
          >
            {!inStock ? (
              <span className="text-xs md:text-sm">Agotado</span>
            ) : hasVariants ? (
              <span className="text-xs md:text-sm">Elegir opcion</span>
            ) : (
              <span className="text-xs md:text-sm">Agregar al carrito</span>
            )}
          </Button>
        </div>
      </Card>

      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{product.name}</DialogTitle>
            <DialogDescription>
              {hasVariants
                ? "Selecciona una variante para agregarla al carrito."
                : "Agrega este producto al carrito."}
            </DialogDescription>
          </DialogHeader>
          <StoreItemQuantityInput
            product={product}
            compact
            onAdded={() => setQuickAddOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
