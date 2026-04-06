"use client";

import OrderStatusBadge from "@/app/components/atoms/order-status-badge";
import { OrdersActionsCell } from "@/app/components/organisms/orders/table-actions-cell";
import SocialMediaBadge from "@/app/components/social-media-badge";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDate, STORE_TIMEZONE } from "@/app/lib/formatters";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import { getOrderStatusLabel } from "@/app/lib/orders/utils";
import OrdersDateFilter from "@/app/components/organisms/orders/orders-date-filter";
import { Input } from "@/app/components/ui/input";
import { useOrdersDateFilter } from "@/app/hooks/use-orders-date-filter";
import { cn } from "@/lib/utils";
import {
	AlertTriangleIcon,
	ChevronRightIcon,
	DownloadIcon,
	ReceiptIcon,
	SearchIcon,
	SlidersHorizontalIcon,
} from "lucide-react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { use, useMemo, useOptimistic, useState, useTransition } from "react";

type ActiveStatus = OrderStatus | "all" | "needs_attention";

type OrdersCardListProps = {
	ordersPromise: Promise<OrderWithRelations[]>;
	activeStatus: ActiveStatus;
};

const STATUS_OPTIONS: { value: "" | OrderStatus | "needs_attention"; label: string }[] = [
	{ value: "", label: "Todos" },
	{ value: "needs_attention", label: "Requieren atención" },
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

function chipToActive(value: "" | OrderStatus | "needs_attention"): ActiveStatus {
	return value === "" ? "all" : value;
}

function sanitizeCsvCell(value: string) {
	const normalized = String(value).trim();
	if (!normalized) return normalized;

	const firstChar = normalized[0];
	if (firstChar === "=" || firstChar === "+" || firstChar === "-" || firstChar === "@") {
		return `'${normalized}`;
	}

	return normalized;
}

function exportOrdersToCsv(orders: OrderWithRelations[]) {
	const headers = [
		"ID",
		"Tipo",
		"Cliente",
		"Teléfono",
		"Productos",
		"Total (Bs)",
		"Estado",
		"Fecha",
	];
	const rows = orders.map((o) => [
		sanitizeCsvCell(String(o.id)),
		sanitizeCsvCell(o.customer ? "Participante" : "Invitado"),
		sanitizeCsvCell(o.customer?.displayName ?? o.guestName ?? "Invitado"),
		sanitizeCsvCell(o.customer?.phoneNumber ?? o.guestPhone ?? ""),
		sanitizeCsvCell(
			o.orderItems.map((i) => `${i.quantity}x ${i.product.name}`).join(", "),
		),
		sanitizeCsvCell(o.totalAmount.toFixed(2)),
		sanitizeCsvCell(getOrderStatusLabel(o.status)),
		sanitizeCsvCell(
			formatDate(o.createdAt).toLocaleString(DateTime.DATETIME_MED),
		),
	]);

	const csv = [headers, ...rows]
		.map((row) =>
			row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
		)
		.join("\n");

	const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `pedidos-${DateTime.now().toISODate()}.csv`;
	link.click();
	URL.revokeObjectURL(url);
}

function OrderCard({
	order,
	activeStatus,
}: {
	order: OrderWithRelations;
	activeStatus: ActiveStatus;
}) {
	const router = useRouter();
	const nowInStore = DateTime.now().setZone(STORE_TIMEZONE);
	const goToOrder = () => router.push(`/dashboard/store/orders/${order.id}`);

	const isOverdue =
		!!order.paymentDueDate &&
		formatDate(order.paymentDueDate) < nowInStore &&
		(order.status === "pending" || order.status === "payment_verification");

	const hasPendingVoucher =
		!!order.paymentVoucherUrl && order.status === "payment_verification";

	const showStatusBadge = activeStatus === "all" || activeStatus === "needs_attention";
	const showOverdueBadge =
		isOverdue &&
		(activeStatus === "all" ||
			activeStatus === "needs_attention" ||
			activeStatus === "pending");

	const itemsPreview = order.orderItems
		.slice(0, 2)
		.map((item) => `${item.quantity}× ${item.product.name}`)
		.join(", ");
	const extraItems =
		order.orderItems.length > 2 ? ` +${order.orderItems.length - 2} más` : "";

	return (
		<Card
			className={cn(
				"cursor-pointer transition-colors hover:bg-accent/40",
				isOverdue && "border-red-200 bg-red-50/30",
			)}
			role="button"
			tabIndex={0}
			onClick={goToOrder}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					goToOrder();
				}
			}}
		>
			<CardContent className="p-4">
				<div className="flex items-start justify-between gap-2">
					<div className="flex flex-col gap-1.5 min-w-0">
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="text-sm font-semibold">#{order.id}</span>
							{showStatusBadge && <OrderStatusBadge status={order.status} />}
							{showOverdueBadge && (
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
						{!order.customer && order.guestPhone && (
							<div onClick={(e) => e.stopPropagation()}>
								<SocialMediaBadge
									socialMediaType="whatsapp"
									username={order.guestPhone}
								/>
							</div>
						)}

						{order.orderItems.length > 0 && (
							<p className="text-xs text-muted-foreground truncate">
								{itemsPreview}
								{extraItems}
							</p>
						)}

						<p className="text-xs text-muted-foreground capitalize">
							{formatDate(order.createdAt).toLocaleString(DateTime.DATE_MED)}
						</p>
					</div>

					<div className="flex flex-col items-end gap-2 shrink-0">
						<div className="flex items-center gap-1">
							<span className="font-semibold text-sm">
								Bs {order.totalAmount.toFixed(2)}
							</span>
							<ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
						</div>
						<div onClick={(e) => e.stopPropagation()}>
							<OrdersActionsCell order={order} />
						</div>
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
	const [filtersOpen, setFiltersOpen] = useState(false);
	const {
		period,
		dateFrom,
		dateTo,
		hasCustomRange,
		filteredByDate,
		selectPeriod,
		handleFromChange,
		handleToChange,
	} = useOrdersDateFilter(orders);

	function handleStatusChange(value: "" | OrderStatus | "needs_attention") {
		const param = value === "" ? "all" : value;
		startTransition(() => {
			setOptimisticStatus(chipToActive(value));
			setSearch("");
			router.push(`/dashboard/store/orders?status=${param}`);
		});
	}

	const visibleOrders = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return filteredByDate;
		return filteredByDate.filter((o) => {
			const customer = (
				o.customer?.displayName ??
				o.guestName ??
				""
			).toLowerCase();
			const id = String(o.id);
			const items = o.orderItems
				.map((i) => i.product.name.toLowerCase())
				.join(" ");
			return customer.includes(q) || id.includes(q) || items.includes(q);
		});
	}, [filteredByDate, search]);

	return (
		<div className="flex flex-col gap-4">
			{/* Status filter */}
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center justify-between">
					<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
						Estado
					</span>
					<div className="flex items-center gap-1.5">
						<button
							onClick={() => exportOrdersToCsv(visibleOrders)}
							className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
						>
							<DownloadIcon className="h-3.5 w-3.5" />
							CSV
						</button>
						<button
							onClick={() => setFiltersOpen((v) => !v)}
							className={cn(
								"relative inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
								filtersOpen
									? "border-primary bg-primary/10 text-primary"
									: "border-border text-muted-foreground hover:bg-accent",
							)}
						>
							<SlidersHorizontalIcon className="h-3.5 w-3.5" />
							Filtros
							{(search !== "" || hasCustomRange || period !== "all") && (
								<span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
							)}
						</button>
					</div>
				</div>
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
			</div>

			{filtersOpen && (
				<>
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

					{/* Date filter */}
					<div className="flex flex-col gap-1.5">
						<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Fecha
						</span>
						<OrdersDateFilter
							period={period}
							dateFrom={dateFrom}
							dateTo={dateTo}
							hasCustomRange={hasCustomRange}
							onPeriodChange={selectPeriod}
							onFromChange={handleFromChange}
							onToChange={handleToChange}
						/>
					</div>
				</>
			)}

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
					visibleOrders.map((order) => (
						<OrderCard
							key={order.id}
							order={order}
							activeStatus={optimisticStatus}
						/>
					))
				)}
			</div>
		</div>
	);
}
