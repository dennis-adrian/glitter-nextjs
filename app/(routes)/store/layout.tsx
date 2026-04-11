import { connection } from "next/server";

import { CartProvider } from "@/app/components/providers/cart-provider";
import StoreSubheader from "@/app/components/organisms/store/store-subheader";
import CartSheet from "@/app/components/organisms/cart/cart-sheet";
import FestivalHappeningNotice from "@/app/components/organisms/store/festival-happening-notice";
import { fetchCartItemCount } from "@/app/lib/cart/actions";
import { getActiveFestivalBase } from "@/app/lib/festivals/helpers";
import { isFestivalHappeningAt } from "@/app/lib/festivals/store-gate";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function StoreLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// Opt into dynamic rendering so we can read the current time below.
	await connection();

	const activeFestival = await getActiveFestivalBase();
	if (isFestivalHappeningAt(activeFestival, new Date())) {
		return <FestivalHappeningNotice />;
	}

	const user = await getCurrentUserProfile();
	const initialItemCount = user ? await fetchCartItemCount() : 0;

	return (
		<CartProvider initialItemCount={initialItemCount} isAuthenticated={!!user}>
			<StoreSubheader />
			<CartSheet />
			{children}
		</CartProvider>
	);
}
