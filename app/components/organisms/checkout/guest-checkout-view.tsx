"use client";

import { CheckoutEmptyCart } from "@/app/components/organisms/checkout/checkout-empty-cart";
import { CheckoutPageLayout } from "@/app/components/organisms/checkout/checkout-page-layout";
import type { CheckoutLineItem } from "@/app/components/organisms/checkout/checkout-line-item";
import { GuestCheckoutForm } from "@/app/components/organisms/checkout/guest-checkout-form";
import { useCartContext } from "@/app/components/providers/cart-provider";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";

export default function GuestCheckoutView() {
	const { guestItems, guestCartHydrated } = useCartContext();

	if (!guestCartHydrated) {
		return null;
	}

	if (guestItems.length === 0) {
		return <CheckoutEmptyCart />;
	}

	const orderLines: CheckoutLineItem[] = guestItems.map((i) => ({
		key: i.productId,
		product: i.product,
		quantity: i.quantity,
	}));
	const presaleLines = orderLines.filter((l) => l.product.isPreOrder);

	const total = guestItems.reduce(
		(sum, i) => sum + getProductPriceAtPurchase(i.product) * i.quantity,
		0,
	);

	return (
		<CheckoutPageLayout
			orderSummaryItems={orderLines}
			total={total}
			presaleItems={presaleLines}
		>
			<GuestCheckoutForm guestItems={guestItems} />
		</CheckoutPageLayout>
	);
}
