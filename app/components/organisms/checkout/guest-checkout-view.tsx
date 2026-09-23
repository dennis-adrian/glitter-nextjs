"use client";

import { useEffect, useState } from "react";

import { CheckoutEmptyCart } from "@/app/components/organisms/checkout/checkout-empty-cart";
import { CheckoutPageLayout } from "@/app/components/organisms/checkout/checkout-page-layout";
import {
  toCheckoutBundleItem,
  type CheckoutBundleItem,
  type CheckoutLineItem,
} from "@/app/components/organisms/checkout/checkout-line-item";
import { GuestCheckoutForm } from "@/app/components/organisms/checkout/guest-checkout-form";
import { useCartContext } from "@/app/components/providers/cart-provider";
import { resolveGuestCartBundles } from "@/app/lib/cart/actions";
import type { CartBundleLine } from "@/app/lib/merch/bundle-definitions";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { getVariantLabel } from "@/app/lib/products/variants";

export default function GuestCheckoutView() {
  const { guestItems, guestBundles, guestCartHydrated } = useCartContext();
  const [resolvedBundles, setResolvedBundles] = useState<
    CartBundleLine[] | null
  >(null);

  // Show current bundle prices and contents; the stored snapshot is only a
  // placeholder until the server answers.
  useEffect(() => {
    if (!guestCartHydrated || guestBundles.length === 0) return;
    let cancelled = false;
    resolveGuestCartBundles(
      guestBundles.map((bundle) => ({
        lineKey: bundle.lineKey,
        bundleId: bundle.bundleId,
        bundleVersion: bundle.bundleVersion,
        quantity: bundle.quantity,
        selections: bundle.selections,
      })),
      guestItems.map((item) => ({
        lineKey: item.lineKey,
        productId: item.productId,
        productVariantId: item.productVariantId,
        quantity: item.quantity,
      })),
    )
      .then((lines) => {
        if (!cancelled) setResolvedBundles(lines);
      })
      .catch(() => {
        if (!cancelled) setResolvedBundles(null);
      });
    return () => {
      cancelled = true;
    };
  }, [guestCartHydrated, guestBundles, guestItems]);

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
    (resolvedBundles ?? []).map((line) => [line.key, line]),
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
  const blockingMessage =
    bundleItems.find((bundle) => bundle.issue)?.issue ?? null;

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
