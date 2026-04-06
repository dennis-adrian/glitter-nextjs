import LowStockAlert from "@/app/components/organisms/orders/low-stock-alert";
import OrdersTotals from "@/app/components/organisms/orders/order_totals_card/totals";
import OrdersSalesChart from "@/app/components/organisms/orders/sales-chart";
import OrdersStatsCards from "@/app/components/organisms/orders/stats-cards";
import { Skeleton } from "@/app/components/ui/skeleton";
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

function LowStockSkeleton() {
	return (
		<div className="rounded-lg border border-amber-200/50 bg-card p-4">
			<div className="flex items-center gap-2 pb-2">
				<Skeleton className="h-5 w-5 shrink-0" />
				<Skeleton className="h-5 w-24" />
			</div>
			<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={i} className="h-10 w-full" />
				))}
			</div>
		</div>
	);
}

function OrdersTotalsSkeleton() {
	return (
		<div className="space-y-3">
			<Skeleton className="h-7 w-48" />
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
				{Array.from({ length: 6 }).map((_, i) => (
					<Skeleton key={i} className="h-28 w-full" />
				))}
			</div>
		</div>
	);
}

export default function StoreAnalyticsPage() {
	const ordersPromise = fetchOrders();
	const ordersTotalsPromise = fetchOrdersTotalsByProduct();
	const statsPromise = fetchOrdersStats();
	const lowStockPromise = fetchLowStockProducts();

	return (
		<div className="space-y-6">
			<div className="space-y-1">
				<h3 className="text-xl font-semibold">Insights de tienda</h3>
				<p className="text-sm text-muted-foreground md:text-base">
					Métricas y tendencias para seguimiento de rendimiento.
				</p>
			</div>

			<Suspense fallback={<StatsCardsSkeleton />}>
				<OrdersStatsCards statsPromise={statsPromise} />
			</Suspense>

			<div className="hidden md:block">
				<Suspense fallback={<Skeleton className="h-72 w-full" />}>
					<OrdersSalesChart ordersPromise={ordersPromise} />
				</Suspense>
			</div>

			<Suspense fallback={<LowStockSkeleton />}>
				<LowStockAlert lowStockPromise={lowStockPromise} />
			</Suspense>

			<Suspense fallback={<OrdersTotalsSkeleton />}>
				<OrdersTotals ordersTotalsPromise={ordersTotalsPromise} />
			</Suspense>
		</div>
	);
}
