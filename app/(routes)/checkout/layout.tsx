import { connection } from "next/server";

import { CartProvider } from "@/app/components/providers/cart-provider";
import FestivalHappeningNotice from "@/app/components/organisms/store/festival-happening-notice";
import StoreClosedNotice from "@/app/components/organisms/store/store-closed-notice";
import { fetchCartWithItems } from "@/app/lib/cart/actions";
import { findClosedSection } from "@/app/lib/store_settings/closure";
import type { StoreSection } from "@/app/lib/store_settings/definitions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export const dynamic = "force-dynamic";

export default async function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Opt into dynamic rendering so we can read the current time below.
  await connection();

  const user = await getCurrentUserProfile();
  const { data: cart } = await fetchCartWithItems();
  const items = cart?.items ?? [];

  // Block checkout when any section present in the (server-side) cart is closed.
  // Guest carts live in localStorage and aren't visible here; their closure is
  // enforced in checkoutGuestCart.
  const sections = items
    .map((item) => item.product?.storeCategory)
    .filter(
      (category): category is StoreSection =>
        category === "merch" || category === "supplies",
    );
  const closedSection = await findClosedSection(sections);

  if (closedSection) {
    const { closure } = closedSection;
    return closure.source === "festival" ? (
      <FestivalHappeningNotice festival={closure.festival} />
    ) : (
      <StoreClosedNotice title={closure.title} message={closure.message} />
    );
  }

  const initialItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartProvider initialItemCount={initialItemCount} isAuthenticated={!!user}>
      {children}
    </CartProvider>
  );
}
