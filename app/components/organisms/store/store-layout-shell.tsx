import CartSheet from "@/app/components/organisms/cart/cart-sheet";
import { CartProvider } from "@/app/components/providers/cart-provider";
import StoreSubheader from "@/app/components/organisms/store/store-subheader";
import { fetchCartItemCount } from "@/app/lib/cart/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function StoreLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  // Section open/closed gating happens per-section via <StoreSectionGate>; the
  // shell only provides shared chrome (cart + subheader) so visitors can still
  // reach an open section when another one is closed.
  // Side by side: the count resolves the caller itself and is 0 signed out.
  const [user, initialItemCount] = await Promise.all([
    getCurrentUserProfile(),
    fetchCartItemCount(),
  ]);

  return (
    <CartProvider initialItemCount={initialItemCount} isAuthenticated={!!user}>
      <StoreSubheader />
      <CartSheet />
      {children}
    </CartProvider>
  );
}
