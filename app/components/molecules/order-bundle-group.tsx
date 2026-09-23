import Image from "next/image";

import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { formatBundleMoney } from "@/app/lib/merch/bundle-pricing";
import type { OrderBundleGroup } from "@/app/lib/orders/utils";
import { getOrderItemDisplayName } from "@/app/lib/orders/utils";
import { getProductVariantImageUrl } from "@/app/lib/products/variants";

/**
 * A bundle bought in an order: its snapshot name and price, and the component
 * lines with the share of the bundle price each one was charged.
 */
export default function OrderBundleGroupRow({
  group,
  imageSize = 56,
  showListPrices = false,
}: {
  group: OrderBundleGroup;
  imageSize?: number;
  /** Also show each component's individual price at purchase (admin). */
  showListPrices?: boolean;
}) {
  const { bundle, items, wholeQuantity, paidTotal } = group;
  const imageUrl =
    bundle.imageUrlSnapshot ??
    (items[0]
      ? getProductVariantImageUrl(items[0].product, items[0].variant)
      : null) ??
    PLACEHOLDER_IMAGE_URLS["300"];
  return (
    <div className="flex gap-3 py-3">
      <div
        className="shrink-0 overflow-hidden rounded-md bg-muted"
        style={{ width: imageSize, height: imageSize }}
      >
        <Image
          src={imageUrl}
          alt=""
          width={imageSize}
          height={imageSize}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2">
          <p className="text-sm font-medium">
            <span className="mr-1.5 rounded-full bg-brand-lavender px-2 py-0.5 text-[10px] font-semibold text-brand-ink">
              Combo
            </span>
            {bundle.nameSnapshot}
          </p>
          <p className="shrink-0 text-sm font-semibold">
            Bs {paidTotal.toFixed(2)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {wholeQuantity != null
            ? `${wholeQuantity} × ${formatBundleMoney(bundle.unitPriceCents)}`
            : "Combo ajustado"}
          {wholeQuantity != null && (
            <span className="ml-1 line-through">
              <span className="sr-only">Por separado </span>
              {formatBundleMoney(bundle.separateUnitPriceCents)}
            </span>
          )}
        </p>
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span>
                {item.quantity} × {getOrderItemDisplayName(item)}
                {item.product.status === "presale" && (
                  <span className="text-amber-600"> · Pre-venta</span>
                )}
              </span>
              <span className="shrink-0 text-right">
                Bs {item.priceAtPurchase.toFixed(2)} c/u
                {showListPrices && item.bundleAllocation && (
                  <span className="block text-[11px]">
                    individual{" "}
                    {formatBundleMoney(
                      item.bundleAllocation.listUnitPriceCents,
                    )}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
