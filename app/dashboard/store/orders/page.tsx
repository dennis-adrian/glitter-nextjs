import OrdersCardList from "@/app/components/organisms/orders/orders-card-list";
import OrdersTable from "@/app/components/organisms/orders/table";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import TableSkeleton from "@/app/components/users/skeletons/table";
import { formatDate, STORE_TIMEZONE } from "@/app/lib/formatters";
import { fetchOrders } from "@/app/lib/orders/actions";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import { AlertTriangleIcon, BanIcon, ReceiptIcon } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { Suspense } from "react";

function OperationalAlertsSkeleton() {
	return (
		<div className="grid grid-cols-3 gap-2">
			{Array.from({ length: 3 }).map((_, i) => (
				<Skeleton key={i} className="h-16 w-full rounded-xl" />
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

	const requiresAction = orders.filter(
		(o) => o.status === "pending" || o.status === "payment_verification",
	).length;

	const overduePayments = orders.filter((o) => {
		if (!o.paymentDueDate) return false;
		if (o.status !== "pending" && o.status !== "payment_verification") return false;
		return formatDate(o.paymentDueDate) < nowInStore;
	}).length;

	const pendingVerification = orders.filter(
		(o) => o.status === "payment_verification",
	).length;

	const stats = [
		{
			label: "Requieren atención",
			value: requiresAction,
			icon: AlertTriangleIcon,
			accent: requiresAction > 0,
			href: undefined,
		},
		{
			label: "Pagos vencidos",
			value: overduePayments,
			icon: BanIcon,
			accent: overduePayments > 0,
			accentColor: "red" as const,
			href: undefined,
		},
		{
			label: "Comprobantes",
			value: pendingVerification,
			icon: ReceiptIcon,
			accent: pendingVerification > 0,
			href: "/dashboard/store/payments",
		},
	];

	return (
		<div className="grid grid-cols-3 gap-2">
			{stats.map((stat) => {
				const Icon = stat.icon;
				const isRed = stat.accentColor === "red";
				const content = (
					<div
						className={`flex flex-col gap-1 rounded-xl border p-3 transition-colors ${
							stat.accent
								? isRed
									? "border-red-200 bg-red-50/50"
									: "border-amber-200 bg-amber-50/50"
								: "border-border bg-card"
						} ${stat.href ? "hover:bg-accent cursor-pointer" : ""}`}
					>
						<Icon
							className={`h-4 w-4 ${
								stat.accent
									? isRed
										? "text-red-500"
										: "text-amber-500"
									: "text-muted-foreground"
							}`}
						/>
						<p
							className={`text-xl font-bold leading-none ${
								stat.accent
									? isRed
										? "text-red-600"
										: "text-amber-600"
									: ""
							}`}
						>
							{stat.value}
						</p>
						<p className="text-xs text-muted-foreground leading-tight">
							{stat.label}
						</p>
					</div>
				);

				return stat.href ? (
					<Link key={stat.label} href={stat.href}>
						{content}
					</Link>
				) : (
					<div key={stat.label}>{content}</div>
				);
			})}
		</div>
	);
}

export default function StoreOrdersPage() {
	const ordersPromise = fetchOrders();

	return (
		<div className="space-y-4">
			<Suspense fallback={<OperationalAlertsSkeleton />}>
				<OrdersOperationalAlerts ordersPromise={ordersPromise} />
			</Suspense>

			<div className="flex items-center justify-end gap-2 md:hidden">
				<Button asChild variant="outline" size="sm">
					<Link href="/dashboard/store/payments">Revisar comprobantes</Link>
				</Button>
			</div>

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
