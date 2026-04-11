import { connection } from "next/server";

import { CartProvider } from "@/app/components/providers/cart-provider";
import FestivalHappeningNotice from "@/app/components/organisms/store/festival-happening-notice";
import { fetchCartItemCount } from "@/app/lib/cart/actions";
import { getActiveFestivalBase } from "@/app/lib/festivals/helpers";
import { isFestivalHappeningAt } from "@/app/lib/festivals/store-gate";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function CheckoutLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	// Opt into dynamic rendering so we can read the current time below.
	await connection();

	const activeFestival = await getActiveFestivalBase();
	if (isFestivalHappeningAt(activeFestival, new Date())) {
		return <FestivalHappeningNotice festival={activeFestival} />;
	}

	const user = await getCurrentUserProfile();
	const initialItemCount = await fetchCartItemCount();

	return (
		<CartProvider initialItemCount={initialItemCount} isAuthenticated={!!user}>
			{children}
		</CartProvider>
	);
}
