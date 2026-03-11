"use client";

import OrderStatusBadge from "@/app/components/atoms/order-status-badge";
import { OrdersActionsCell } from "@/app/components/organisms/orders/table-actions-cell";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDate } from "@/app/lib/formatters";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import { getOrderStatusLabel } from "@/app/lib/orders/utils";
import { DateTime } from "luxon";
import { use, useMemo, useState } from "react";

type OrdersCardListProps = {
	ordersPromise: Promise<OrderWithRelations[]>;
};

const STATUS_OPTIONS: { value: "" | OrderStatus; label: string }[] = [
	{ value: "", label: "Todos los estados" },
	{ value: "pending", label: getOrderStatusLabel("pending") },
	{
		value: "payment_verification",
		label: getOrderStatusLabel("payment_verification"),
	},
	{ value: "processing", label: getOrderStatusLabel("processing") },
	{ value: "paid", label: getOrderStatusLabel("paid") },
	{ value: "delivered", label: getOrderStatusLabel("delivered") },
	{ value: "cancelled", label: getOrderStatusLabel("cancelled") },
];

export default function OrdersCardList({ ordersPromise }: OrdersCardListProps) {
	const orders = use(ordersPromise);
	const [statusFilter, setStatusFilter] = useState<"" | OrderStatus>("");

	const filtered = useMemo(
		() =>
			statusFilter
				? orders.filter((o) => o.status === statusFilter)
				: orders,
		[orders, statusFilter],
	);

	return (
		<div className="flex flex-col gap-3">
			<select
				className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
				value={statusFilter}
				onChange={(e) =>
					setStatusFilter(e.target.value as "" | OrderStatus)
				}
			>
				{STATUS_OPTIONS.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
			{filtered.length === 0 && (
				<p className="text-sm text-muted-foreground text-center py-8">
					No hay pedidos para mostrar.
				</p>
			)}
			{filtered.map((order) => (
				<Card key={order.id}>
					<CardContent className="p-4">
						<div className="flex items-start justify-between gap-2">
							<div className="flex flex-col gap-1 min-w-0">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="text-sm font-semibold">
										#{order.id}
									</span>
									<OrderStatusBadge status={order.status} />
								</div>
								<p className="text-sm text-muted-foreground truncate">
									{order.customer.displayName}
								</p>
								<p className="text-xs text-muted-foreground capitalize">
									{formatDate(order.createdAt).toLocaleString(
										DateTime.DATE_MED,
									)}
								</p>
							</div>
							<div className="flex flex-col items-end gap-2 shrink-0">
								<span className="font-semibold text-sm">
									Bs {order.totalAmount.toFixed(2)}
								</span>
								<OrdersActionsCell order={order} />
							</div>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
