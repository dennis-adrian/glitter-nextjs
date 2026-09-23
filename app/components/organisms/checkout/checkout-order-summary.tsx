"use client";

import Image from "next/image";
import { BoxIcon } from "lucide-react";

import Heading from "@/app/components/atoms/heading";
import { Card, CardContent } from "@/app/components/ui/card";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { getLineUnitPrice } from "@/app/lib/orders/utils";
import { formatBundleMoney } from "@/app/lib/merch/bundle-pricing";
import { getProductVariantImageUrl } from "@/app/lib/products/variants";

import type {
  CheckoutBundleItem,
  CheckoutLineItem,
} from "./checkout-line-item";

type CheckoutOrderSummaryProps = {
  items: CheckoutLineItem[];
  bundles?: CheckoutBundleItem[];
  total: number;
};

export function CheckoutOrderSummary({
  items,
  bundles = [],
  total,
}: CheckoutOrderSummaryProps) {
  return (
    <Card className="self-start">
      <CardContent className="p-6">
        <Heading level={4} className="mb-4 flex items-center gap-2">
          <BoxIcon className="h-4 w-4" />
          Artículos
        </Heading>
        <div className="divide-y">
          {bundles.map((bundle) => (
            <div key={bundle.key} className="flex gap-3 py-3">
              <div className="shrink-0 w-14 h-14 rounded-md overflow-hidden bg-muted">
                <Image
                  src={bundle.imageUrl ?? PLACEHOLDER_IMAGE_URLS["300"]}
                  alt=""
                  width={56}
                  height={56}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">
                  <span className="mr-1.5 rounded-full bg-brand-lavender px-2 py-0.5 text-[10px] font-semibold text-brand-ink">
                    Combo
                  </span>
                  {bundle.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {bundle.quantity} × {formatBundleMoney(bundle.unitPriceCents)}
                  {bundle.separateUnitPriceCents > bundle.unitPriceCents && (
                    <span className="ml-1 line-through">
                      <span className="sr-only">Por separado </span>
                      {formatBundleMoney(bundle.separateUnitPriceCents)}
                    </span>
                  )}
                </p>
                <ul className="mt-1 text-xs text-muted-foreground">
                  {bundle.components.map((component, index) => (
                    <li key={`${component.productName}-${index}`}>
                      {component.quantity * bundle.quantity} ×{" "}
                      {component.productName}
                      {component.variantLabel && ` (${component.variantLabel})`}
                      {component.isPresale && (
                        <span className="text-amber-600"> · Pre-venta</span>
                      )}
                    </li>
                  ))}
                </ul>
                {bundle.issue && (
                  <p className="mt-1 text-xs font-medium text-destructive">
                    {bundle.issue}
                  </p>
                )}
              </div>
              <p className="text-sm font-semibold shrink-0">
                {formatBundleMoney(bundle.unitPriceCents * bundle.quantity)}
              </p>
            </div>
          ))}
          {items.map((item) => {
            const imageUrl =
              getProductVariantImageUrl(item.product, item.variant) ??
              PLACEHOLDER_IMAGE_URLS["300"];
            const unitPrice = getLineUnitPrice(
              item.product,
              item.variant,
              item.transactionType ?? "purchase",
            );
            const productName = item.productVariantLabel
              ? `${item.product.name} (${item.productVariantLabel})`
              : item.product.name;

            return (
              <div key={item.key} className="flex gap-3 py-3">
                <div className="shrink-0 w-14 h-14 rounded-md overflow-hidden bg-muted">
                  <Image
                    src={imageUrl}
                    alt={item.product.name}
                    width={56}
                    height={56}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × Bs {unitPrice.toFixed(2)}
                    {item.transactionType === "rental" ? " (alquiler)" : ""}
                  </p>
                  {item.product.status === "presale" && (
                    <span className="inline-block text-xs text-amber-600 font-medium mt-0.5">
                      Pre-venta
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold shrink-0">
                  Bs {(unitPrice * item.quantity).toFixed(2)}
                </p>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between font-semibold text-base pt-4 border-t mt-2">
          <span>Total</span>
          <span>Bs {total.toFixed(2)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
