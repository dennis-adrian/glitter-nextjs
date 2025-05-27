import OrdersTable from "@/app/components/organisms/orders/table";
import OrdersTotals from "@/app/components/organisms/orders/order_totals_card/totals";
import TableSkeleton from "@/app/components/users/skeletons/table";
import {
	fetchOrders,
	fetchOrdersTotalsByProduct,
} from "@/app/lib/orders/actions";
import { Suspense } from "react";

export default function OrdersPage() {
	const ordersPromise = fetchOrders();
	const ordersTotalsPromise = fetchOrdersTotalsByProduct();

	return (
		<div className="container p-3 md:p-6">
			<h1 className="text-2xl font-bold">Pedidos</h1>
			<Suspense>
				<OrdersTotals ordersTotalsPromise={ordersTotalsPromise} />
			</Suspense>
			<Suspense fallback={<TableSkeleton />}>
				<OrdersTable ordersPromise={ordersPromise} />
			</Suspense>
		</div>
	);
}
