import { CartProvider } from "@/app/components/providers/cart-provider";
import { fetchCartItemCount } from "@/app/lib/cart/actions";

export default async function CheckoutLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const initialItemCount = await fetchCartItemCount();

	return (
		<CartProvider initialItemCount={initialItemCount}>
			{children}
		</CartProvider>
	);
}
