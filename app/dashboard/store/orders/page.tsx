import OrdersCardList from "@/app/components/organisms/orders/orders-card-list";
import OrdersTable from "@/app/components/organisms/orders/table";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Skeleton } from "@/app/components/ui/skeleton";
import TableSkeleton from "@/app/components/users/skeletons/table";
import { formatDate, STORE_TIMEZONE } from "@/app/lib/formatters";
import {
	fetchOrders,
} from "@/app/lib/orders/actions";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import { DateTime } from "luxon";
import Link from "next/link";
import { Suspense } from "react";

function OperationalAlertsSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
			{Array.from({ length: 3 }).map((_, i) => (
				<Skeleton key={i} className="h-24 w-full" />
			))}
		</div>
	);
}

async function OrdersOperationalAlerts({
	ordersPromise,
}: {
	ordersPromise: Promise<OrderWithRelations[]>;
}) {
	const orders = await ordersPromise;
	const nowInStore = DateTime.now().setZone(STORE_TIMEZONE);

	const pendingVerification = orders.filter(
		(order) => order.status === "payment_verification",
	).length;

	const requiresAction = orders.filter(
		(order) => order.status === "pending" || order.status === "payment_verification",
	).length;

	const overduePayments = orders.filter((order) => {
		if (!order.paymentDueDate) return false;
		if (order.status !== "pending" && order.status !== "payment_verification")
			return false;
		return formatDate(order.paymentDueDate) < nowInStore;
	}).length;

	return (
		<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
			<Card className="border-amber-200/70 bg-amber-50/30">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm text-muted-foreground">
						Requieren atención
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-2xl font-semibold">{requiresAction}</p>
				</CardContent>
			</Card>

			<Card className="border-destructive/30 bg-destructive/5">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm text-muted-foreground">
						Pagos vencidos
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-2xl font-semibold">{overduePayments}</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm text-muted-foreground">
						Comprobantes por revisar
					</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center justify-between gap-3">
					<p className="text-2xl font-semibold">{pendingVerification}</p>
					<Button asChild size="sm" variant="outline">
						<Link href="/dashboard/store/payments">Ir a pagos</Link>
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}

export default function StoreOrdersPage() {
	const ordersPromise = fetchOrders();

	return (
		<div className="space-y-6">
			<section className="space-y-4">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div className="space-y-1">
						<h3 className="text-xl font-semibold">Gestión de pedidos</h3>
						<p className="text-sm text-muted-foreground md:text-base">
							Administra pedidos primero y revisa métricas cuando lo necesites.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button asChild variant="outline" size="sm">
							<Link href="/dashboard/store/payments">Revisar comprobantes</Link>
						</Button>
						<Button asChild size="sm">
							<Link href="/dashboard/store/products">Gestionar productos</Link>
						</Button>
					</div>
				</div>

				<Suspense fallback={<OperationalAlertsSkeleton />}>
					<OrdersOperationalAlerts ordersPromise={ordersPromise} />
				</Suspense>
			</section>

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
