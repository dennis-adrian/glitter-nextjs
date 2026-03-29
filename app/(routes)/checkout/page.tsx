import { redirect } from "next/navigation";

import OrderDeliveryInfo from "@/app/components/molecules/order-delivery-info";
import CheckoutConfirmButton from "@/app/components/organisms/checkout/checkout-confirm-button";
import type { CheckoutLineItem } from "@/app/components/organisms/checkout/checkout-line-item";
import { CheckoutPageLayout } from "@/app/components/organisms/checkout/checkout-page-layout";
import GuestCheckoutView from "@/app/components/organisms/checkout/guest-checkout-view";
import { fetchCartWithItems } from "@/app/lib/cart/actions";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function CheckoutPage() {
	const user = await getCurrentUserProfile();

	// Unauthenticated users get the guest checkout form (cart is in localStorage)
	if (!user) {
		return <GuestCheckoutView />;
	}

	const { success, data: cart } = await fetchCartWithItems();
	if (!success) {
		throw new Error(
			"No se pudo cargar el carrito. Intentá de nuevo más tarde.",
		);
	}
	if (!cart || cart.items.length === 0) redirect("/store");

	const orderLines: CheckoutLineItem[] = cart.items.map((i) => ({
		key: i.id,
		product: i.product,
		quantity: i.quantity,
	}));
	const presaleLines = orderLines.filter((l) => l.product.isPreOrder);
	const availableItems = cart.items.filter((i) => !i.product.isPreOrder);

	const total = cart.items.reduce(
		(sum, i) => sum + getProductPriceAtPurchase(i.product) * i.quantity,
		0,
	);

	return (
		<CheckoutPageLayout
			orderSummaryItems={orderLines}
			total={total}
			presaleItems={presaleLines}
		>
			<OrderDeliveryInfo
				hasAvailableItems={availableItems.length > 0}
				hasPresaleItems={presaleLines.length > 0}
			/>

			<div className="fixed bottom-0 left-0 right-0 bg-background border-t px-4 py-4 z-40 md:static md:border-0 md:px-0 md:py-0 md:bg-transparent">
				<CheckoutConfirmButton />
			</div>
		</CheckoutPageLayout>
	);
}
