import OrderDeliveryInfo from "@/app/components/molecules/order-delivery-info";
import CheckoutActions from "@/app/components/organisms/checkout/checkout-actions";
import { CheckoutEmptyCart } from "@/app/components/organisms/checkout/checkout-empty-cart";
import {
  toCheckoutBundleItem,
  type CheckoutLineItem,
} from "@/app/components/organisms/checkout/checkout-line-item";
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

  if (!cart || (cart.items.length === 0 && cart.bundles.length === 0)) {
    return <CheckoutEmptyCart />;
  }
  const bundleItems = cart.bundles.map(toCheckoutBundleItem);
  const bundleIssue = cart.bundles.find((line) => line.issue)?.message ?? null;

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
  const bundleHasPresale = bundleItems.some((bundle) =>
    bundle.components.some((component) => component.isPresale),
  );
  const bundleHasAvailable = bundleItems.some((bundle) =>
    bundle.components.some((component) => !component.isPresale),
  );
  const hasRentalItems = cart.items.some((i) => i.transactionType === "rental");
  const rentalEligibility = hasRentalItems
    ? await getRentalEligibilityForCurrentUser()
    : null;

  if (hasRentalItems && rentalEligibility && !rentalEligibility.eligible) {
    return <CheckoutRentalIneligible message={rentalEligibility.message} />;
  }

  const persistedRentalItem = cart.items.find(
    (item) =>
      item.transactionType === "rental" && item.rentalReservationId != null,
  );
  if (
    hasRentalItems &&
    rentalEligibility?.eligible &&
    persistedRentalItem &&
    !rentalEligibility.contexts.some(
      (context) => context.festivalId === persistedRentalItem.rentalFestivalId,
    )
  ) {
    return (
      <CheckoutRentalIneligible message="El contexto de alquiler del carrito cambió. Vuelve a agregar los productos de alquiler." />
    );
  }
  const checkoutRentalContexts =
    rentalEligibility?.eligible && persistedRentalItem
      ? rentalEligibility.contexts.filter(
          (context) =>
            context.festivalId === persistedRentalItem.rentalFestivalId,
        )
      : rentalEligibility?.eligible
        ? rentalEligibility.contexts
        : [];

  const total =
    cart.items.reduce(
      (sum, i) =>
        sum +
        getLineUnitPrice(i.product, i.variant, i.transactionType) * i.quantity,
      0,
    ) +
    bundleItems.reduce(
      (sum, bundle) =>
        // A bundle that cannot be bought shows no price, so it adds none.
        bundle.unitPriceCents === null
          ? sum
          : sum + (bundle.unitPriceCents * bundle.quantity) / 100,
      0,
    );

  return (
    <CheckoutPageLayout
      orderSummaryItems={orderLines}
      bundleItems={bundleItems}
      total={total}
      presaleItems={presaleLines}
    >
      <CheckoutActions
        hasRentalItems={hasRentalItems}
        hasAvailableItems={availableItems.length > 0 || bundleHasAvailable}
        hasPresaleItems={presaleLines.length > 0 || bundleHasPresale}
        blockingMessage={bundleIssue}
        rentalContexts={checkoutRentalContexts}
        initialReservationId={persistedRentalItem?.rentalReservationId ?? null}
      />
    </CheckoutPageLayout>
  );
}
