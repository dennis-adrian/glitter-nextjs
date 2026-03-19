import { Suspense } from "react";
import { notFound } from "next/navigation";

import Heading from "@/app/components/atoms/heading";
import OrdersList from "@/app/components/organisms/profile-orders/orders-list";
import OrdersSkeleton from "@/app/components/organisms/profile-orders/orders-skeleton";
import OrdersTabBar from "@/app/components/organisms/profile-orders/orders-tab-bar";
import {
	ORDER_TAB_VALUES,
	type OrderTabValue,
} from "@/app/lib/orders/order-tabs";
import {
	fetchOrderCountsByUserId,
	fetchOrdersByUserIdAndStatus,
} from "@/app/lib/orders/actions";
import { getCurrentBaseProfile } from "@/app/lib/users/helpers";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MyOrdersPage(props: {
	searchParams: Promise<{ tab?: string }>;
}) {
	const currentProfile = await getCurrentBaseProfile();
	if (!currentProfile) {
		notFound();
	}

	const { tab } = await props.searchParams;
	const activeTab: OrderTabValue = ORDER_TAB_VALUES.includes(
		tab as OrderTabValue,
	)
		? (tab as OrderTabValue)
		: "pending";

	// Fast aggregate — await so tab counts are available when the shell renders
	const counts = await fetchOrderCountsByUserId(currentProfile.id);

	// Start but do NOT await — pass as Promise to enable streaming via Suspense
	const ordersPromise = fetchOrdersByUserIdAndStatus(
		currentProfile.id,
		activeTab,
	);

	return (
		<div className="container p-3 md:p-6">
			<Heading>Mis pedidos</Heading>
			<p>Aquí podés ver los pedidos que realizaste</p>
			<OrdersTabBar activeTab={activeTab} counts={counts}>
				<Suspense fallback={<OrdersSkeleton />}>
					<OrdersList ordersPromise={ordersPromise} />
				</Suspense>
			</OrdersTabBar>
		</div>
	);
}
