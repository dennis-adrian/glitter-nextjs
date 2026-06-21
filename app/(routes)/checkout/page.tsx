import OrderDeliveryInfo from "@/app/components/molecules/order-delivery-info";
import CheckoutActions from "@/app/components/organisms/checkout/checkout-actions";
import { CheckoutEmptyCart } from "@/app/components/organisms/checkout/checkout-empty-cart";
import type { CheckoutLineItem } from "@/app/components/organisms/checkout/checkout-line-item";
import { CheckoutPageLayout } from "@/app/components/organisms/checkout/checkout-page-layout";
import CheckoutRentalIneligible from "@/app/components/organisms/checkout/checkout-rental-ineligible";
import GuestCheckoutView from "@/app/components/organisms/checkout/guest-checkout-view";
import { fetchCartWithItems } from "@/app/lib/cart/actions";
import { getLineUnitPrice } from "@/app/lib/orders/utils";
import { getRentalEligibilityForCurrentUser } from "@/app/lib/rentals/eligibility";
import { getVariantLabel } from "@/app/lib/products/variants";
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

  if (!cart || cart.items.length === 0) {
    return <CheckoutEmptyCart />;
  }

  const orderLines: CheckoutLineItem[] = cart.items.map((i) => ({
    key: i.id,
    product: i.product,
    variant: i.variant,
    productVariantLabel: getVariantLabel(i.variant),
    quantity: i.quantity,
    transactionType: i.transactionType,
  }));
  const presaleLines = orderLines.filter((l) => l.product.status === "presale");
  const availableItems = cart.items.filter(
    (i) => i.product.status !== "presale",
  );
  const hasRentalItems = cart.items.some((i) => i.transactionType === "rental");
  const rentalEligibility = hasRentalItems
    ? await getRentalEligibilityForCurrentUser()
    : null;

  if (
    hasRentalItems &&
    rentalEligibility &&
    !rentalEligibility.eligible
  ) {
    return <CheckoutRentalIneligible message={rentalEligibility.message} />;
  }

  const persistedRentalItem = cart.items.find(
    (item) =>
      item.transactionType === "rental" &&
      item.rentalReservationId != null,
  );

  const total = cart.items.reduce(
    (sum, i) =>
      sum +
      getLineUnitPrice(i.product, i.variant, i.transactionType) * i.quantity,
    0,
  );

  return (
    <CheckoutPageLayout
      orderSummaryItems={orderLines}
      total={total}
      presaleItems={presaleLines}
    >
      <CheckoutActions
        hasRentalItems={hasRentalItems}
        hasAvailableItems={availableItems.length > 0}
        hasPresaleItems={presaleLines.length > 0}
        rentalContexts={
          rentalEligibility?.eligible ? rentalEligibility.contexts : []
        }
        initialReservationId={persistedRentalItem?.rentalReservationId ?? null}
      />
    </CheckoutPageLayout>
  );
}
