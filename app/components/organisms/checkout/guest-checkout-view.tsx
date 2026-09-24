"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CheckoutEmptyCart } from "@/app/components/organisms/checkout/checkout-empty-cart";
import { CheckoutPageLayout } from "@/app/components/organisms/checkout/checkout-page-layout";
import {
  toCheckoutBundleItem,
  type CheckoutBundleItem,
  type CheckoutLineItem,
} from "@/app/components/organisms/checkout/checkout-line-item";
import { GuestCheckoutForm } from "@/app/components/organisms/checkout/guest-checkout-form";
import { useCartContext } from "@/app/components/providers/cart-provider";
import {
  resolveGuestCart,
  validateGuestCartStock,
  type GuestCartResolution,
} from "@/app/lib/cart/actions";
import {
  removedBundlesNotice,
  toGuestBundleInputs,
  toGuestItemInputs,
} from "@/app/lib/cart/utils";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { getVariantLabel } from "@/app/lib/products/variants";

export default function GuestCheckoutView() {
  const { guestItems, guestBundles, guestCartHydrated, reconcileGuestBundles } =
    useCartContext();
  const [resolution, setResolution] = useState<GuestCartResolution | null>(
    null,
  );

  // Show current bundle prices and contents, and check every line's stock
  // (bundles and individual lines share it) before the guest confirms; the
  // stored snapshot is only a placeholder until the server answers.
  useEffect(() => {
    if (!guestCartHydrated) return;
    if (guestItems.length === 0 && guestBundles.length === 0) return;
    let cancelled = false;
    const items = toGuestItemInputs(guestItems);
    const request: Promise<GuestCartResolution> =
      guestBundles.length > 0
        ? resolveGuestCart(toGuestBundleInputs(guestBundles), items)
        : validateGuestCartStock(items).then((checks) => ({
            bundles: [],
            items: checks,
            removedBundleKeys: [],
          }));
    request
      .then((result) => {
        if (cancelled) return;
        setResolution(result);
        const removed = reconcileGuestBundles(result);
        if (removed > 0) toast.info(removedBundlesNotice(removed));
      })
      .catch(() => {
        if (!cancelled) setResolution(null);
      });
    return () => {
      cancelled = true;
    };
  }, [guestCartHydrated, guestBundles, guestItems, reconcileGuestBundles]);

  if (!guestCartHydrated) {
    return null;
  }

  if (guestItems.length === 0 && guestBundles.length === 0) {
    return <CheckoutEmptyCart />;
  }

  const orderLines: CheckoutLineItem[] = guestItems.map((i) => ({
    key: i.lineKey,
    product: i.product,
    variant: i.variant,
    productVariantLabel: i.productVariantLabel ?? getVariantLabel(i.variant),
    quantity: i.quantity,
  }));
  const presaleLines = orderLines.filter((l) => l.product.status === "presale");

  const resolvedByKey = new Map(
    (resolution?.bundles ?? []).map((line) => [line.key, line]),
  );
  const bundleItems: CheckoutBundleItem[] = guestBundles.map((bundle) => {
    const line = resolvedByKey.get(bundle.lineKey);
    return line && line.components.length > 0
      ? toCheckoutBundleItem({ ...line, quantity: bundle.quantity })
      : {
          key: bundle.lineKey,
          name: bundle.name,
          imageUrl: bundle.imageUrl,
          quantity: bundle.quantity,
          unitPriceCents: bundle.unitPriceCents,
          separateUnitPriceCents: bundle.separateUnitPriceCents,
          components: bundle.components,
          issue: line?.message ?? null,
        };
  });
  const checksByKey = new Map(
    (resolution?.items ?? []).map((check) => [check.lineKey, check]),
  );
  const itemIssue = guestItems.flatMap((item) => {
    const check = checksByKey.get(item.lineKey);
    if (!check || (!check.isOutOfStock && !check.quantityExceedsStock)) {
      return [];
    }
    const label = item.productVariantLabel ?? getVariantLabel(item.variant);
    const name = label ? `${item.product.name} (${label})` : item.product.name;
    return [
      check.isOutOfStock
        ? `${name} ya no tiene stock.`
        : `Solo quedan ${check.stock} unidades de ${name}.`,
    ];
  })[0];
  const blockingMessage =
    bundleItems.find((bundle) => bundle.issue)?.issue ?? itemIssue ?? null;

  const total =
    guestItems.reduce(
      (sum, i) =>
        sum + getProductPriceAtPurchase(i.product, i.variant) * i.quantity,
      0,
    ) +
    bundleItems.reduce(
      (sum, bundle) => sum + (bundle.unitPriceCents * bundle.quantity) / 100,
      0,
    );

  return (
    <CheckoutPageLayout
      orderSummaryItems={orderLines}
      bundleItems={bundleItems}
      total={total}
      presaleItems={presaleLines}
    >
      <GuestCheckoutForm
        guestItems={guestItems}
        guestBundles={guestBundles}
        blockingMessage={blockingMessage}
      />
    </CheckoutPageLayout>
  );
}
