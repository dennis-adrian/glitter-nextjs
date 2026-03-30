import { CartProvider } from "@/app/components/providers/cart-provider";
import { fetchCartItemCount } from "@/app/lib/cart/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function CheckoutLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const user = await getCurrentUserProfile();
	const initialItemCount = await fetchCartItemCount();

	return (
		<CartProvider initialItemCount={initialItemCount} isAuthenticated={!!user}>
			{children}
		</CartProvider>
	);
}
