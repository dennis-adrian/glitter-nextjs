import { CartProvider } from "@/app/components/providers/cart-provider";
import StoreSubheader from "@/app/components/organisms/store/store-subheader";
import CartSheet from "@/app/components/organisms/cart/cart-sheet";
import { fetchCartItemCount } from "@/app/lib/cart/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function StoreLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const user = await getCurrentUserProfile();
	const initialItemCount = await fetchCartItemCount();

	return (
		<CartProvider initialItemCount={initialItemCount}>
			<StoreSubheader />
			{user && <CartSheet user={user} />}
			{children}
		</CartProvider>
	);
}
