"use client";

import OrderStatusBadge from "@/app/components/atoms/order-status-badge";
import { OrdersActionsCell } from "@/app/components/organisms/orders/table-actions-cell";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDate, STORE_TIMEZONE } from "@/app/lib/formatters";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import { getOrderStatusLabel } from "@/app/lib/orders/utils";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertTriangleIcon, ReceiptIcon, SearchIcon } from "lucide-react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { use, useMemo, useOptimistic, useState, useTransition } from "react";

type ActiveStatus = OrderStatus | "all";

type OrdersCardListProps = {
	ordersPromise: Promise<OrderWithRelations[]>;
	activeStatus: ActiveStatus;
};

const STATUS_OPTIONS: { value: "" | OrderStatus; label: string }[] = [
	{ value: "", label: "Todos" },
	{ value: "pending", label: getOrderStatusLabel("pending") },
	{ value: "payment_verification", label: getOrderStatusLabel("payment_verification") },
	{ value: "processing", label: getOrderStatusLabel("processing") },
	{ value: "paid", label: getOrderStatusLabel("paid") },
	{ value: "delivered", label: getOrderStatusLabel("delivered") },
	{ value: "cancelled", label: getOrderStatusLabel("cancelled") },
];

function chipToActive(value: "" | OrderStatus): ActiveStatus {
	return value === "" ? "all" : value;
}

function OrderCard({ order }: { order: OrderWithRelations }) {
	const router = useRouter();
	const nowInStore = DateTime.now().setZone(STORE_TIMEZONE);

	const isOverdue =
		!!order.paymentDueDate &&
		formatDate(order.paymentDueDate) < nowInStore &&
		(order.status === "pending" || order.status === "payment_verification");

	const hasPendingVoucher =
		!!order.paymentVoucherUrl && order.status === "payment_verification";

	const itemsPreview = order.orderItems
		.slice(0, 2)
		.map((item) => `${item.quantity}× ${item.product.name}`)
		.join(", ");
	const extraItems =
		order.orderItems.length > 2
			? ` +${order.orderItems.length - 2} más`
			: "";

	return (
		<Card
			className={cn(
				"cursor-pointer transition-colors hover:bg-accent/40",
				isOverdue && "border-red-200 bg-red-50/30",
			)}
			onClick={() => router.push(`/dashboard/store/orders/${order.id}`)}
		>
			<CardContent className="p-4">
				<div className="flex items-start justify-between gap-2">
					<div className="flex flex-col gap-1.5 min-w-0">
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="text-sm font-semibold">#{order.id}</span>
							<OrderStatusBadge status={order.status} />
							{isOverdue && (
								<span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
									<AlertTriangleIcon className="h-3 w-3" />
									Vencido
								</span>
							)}
							{hasPendingVoucher && (
								<span className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
									<ReceiptIcon className="h-3 w-3" />
									Comprobante
								</span>
							)}
						</div>

						<p className="text-sm text-muted-foreground truncate">
							{order.customer?.displayName ?? order.guestName ?? "Invitado"}
						</p>

						{order.orderItems.length > 0 && (
							<p className="text-xs text-muted-foreground truncate">
								{itemsPreview}{extraItems}
							</p>
						)}

						<p className="text-xs text-muted-foreground capitalize">
							{formatDate(order.createdAt).toLocaleString(DateTime.DATE_MED)}
						</p>
					</div>

					<div
						className="flex flex-col items-end gap-2 shrink-0"
						onClick={(e) => e.stopPropagation()}
					>
						<span className="font-semibold text-sm">
							Bs {order.totalAmount.toFixed(2)}
						</span>
						<OrdersActionsCell order={order} />
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export default function OrdersCardList({
	ordersPromise,
	activeStatus,
}: OrdersCardListProps) {
	const orders = use(ordersPromise);
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [optimisticStatus, setOptimisticStatus] = useOptimistic(activeStatus);
	const [search, setSearch] = useState("");

	function handleStatusChange(value: "" | OrderStatus) {
		const param = value === "" ? "all" : value;
		startTransition(() => {
			setOptimisticStatus(chipToActive(value));
			setSearch("");
			router.push(`/dashboard/store/orders?status=${param}`);
		});
	}

	const visibleOrders = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return orders;
		return orders.filter((o) => {
			const customer = (o.customer?.displayName ?? o.guestName ?? "").toLowerCase();
			const id = String(o.id);
			const items = o.orderItems.map((i) => i.product.name.toLowerCase()).join(" ");
			return customer.includes(q) || id.includes(q) || items.includes(q);
		});
	}, [orders, search]);

	return (
		<div className="flex flex-col gap-3">
			{/* Filter chips */}
			<div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 [&::-webkit-scrollbar]:hidden">
				{STATUS_OPTIONS.map((opt) => {
					const isActive = optimisticStatus === chipToActive(opt.value);
					return (
						<button
							key={opt.value}
							onClick={() => handleStatusChange(opt.value)}
							className={cn(
								"shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
								isActive
									? "bg-primary text-primary-foreground border-primary"
									: "border-border text-muted-foreground hover:bg-accent",
							)}
						>
							{opt.label}
						</button>
					);
				})}
			</div>

			{/* Search */}
			<div className="relative">
				<SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					placeholder="Buscar por cliente, ID o producto..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="pl-9"
				/>
			</div>

			{/* Cards */}
			<div
				className={cn(
					"flex flex-col gap-3 transition-opacity",
					isPending && "opacity-60 pointer-events-none",
				)}
			>
				{visibleOrders.length === 0 ? (
					<p className="text-sm text-muted-foreground text-center py-8">
						No hay pedidos para mostrar.
					</p>
				) : (
					visibleOrders.map((order) => <OrderCard key={order.id} order={order} />)
				)}
			</div>
		</div>
	);
}
