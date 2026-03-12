import LowStockAlert from "@/app/components/organisms/orders/low-stock-alert";
import OrdersCardList from "@/app/components/organisms/orders/orders-card-list";
import OrdersTotals from "@/app/components/organisms/orders/order_totals_card/totals";
import OrdersSalesChart from "@/app/components/organisms/orders/sales-chart";
import OrdersStatsCards from "@/app/components/organisms/orders/stats-cards";
import OrdersTable from "@/app/components/organisms/orders/table";
import { Skeleton } from "@/app/components/ui/skeleton";
import TableSkeleton from "@/app/components/users/skeletons/table";
import {
	fetchOrders,
	fetchOrdersStats,
	fetchOrdersTotalsByProduct,
} from "@/app/lib/orders/actions";
import { fetchLowStockProducts } from "@/app/lib/products/actions";
import { Suspense } from "react";

function StatsCardsSkeleton() {
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
			{Array.from({ length: 6 }).map((_, i) => (
				<Skeleton key={i} className="h-24 w-full" />
			))}
		</div>
	);
}

export default function StoreOrdersPage() {
	const ordersPromise = fetchOrders();
	const ordersTotalsPromise = fetchOrdersTotalsByProduct();
	const statsPromise = fetchOrdersStats();
	const lowStockPromise = fetchLowStockProducts();

	return (
		<div className="space-y-6">
			<Suspense fallback={<StatsCardsSkeleton />}>
				<OrdersStatsCards statsPromise={statsPromise} />
			</Suspense>

			<div className="hidden md:block">
				<Suspense fallback={<Skeleton className="h-72 w-full" />}>
					<OrdersSalesChart ordersPromise={ordersPromise} />
				</Suspense>
			</div>

			<Suspense>
				<LowStockAlert lowStockPromise={lowStockPromise} />
			</Suspense>

			<Suspense>
				<OrdersTotals ordersTotalsPromise={ordersTotalsPromise} />
			</Suspense>

			<div className="block md:hidden">
				<Suspense fallback={<TableSkeleton />}>
					<OrdersCardList ordersPromise={ordersPromise} />
				</Suspense>
			</div>

			<div className="hidden md:block">
				<Suspense fallback={<TableSkeleton />}>
					<OrdersTable ordersPromise={ordersPromise} />
				</Suspense>
			</div>
		</div>
	);
}
