"use client";

import {
	columns,
	columnTitles,
} from "@/app/components/organisms/orders/table-columns";
import { Button } from "@/app/components/ui/button";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { formatDate } from "@/app/lib/formatters";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import { getOrderStatusLabel } from "@/app/lib/orders/utils";
import type { Table } from "@tanstack/react-table";
import { DownloadIcon } from "lucide-react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { use, useMemo, useOptimistic, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

type DatePeriod = "all" | "today" | "week" | "month";
type ActiveStatus = OrderStatus | "all";

type OrdersTableProps = {
	ordersPromise: Promise<OrderWithRelations[]>;
	activeStatus: ActiveStatus;
};

const STATUS_OPTIONS: { value: ActiveStatus; label: string }[] = [
	{ value: "all", label: "Todos" },
	{ value: "pending", label: getOrderStatusLabel("pending") },
	{ value: "payment_verification", label: getOrderStatusLabel("payment_verification") },
	{ value: "processing", label: getOrderStatusLabel("processing") },
	{ value: "paid", label: getOrderStatusLabel("paid") },
	{ value: "delivered", label: getOrderStatusLabel("delivered") },
	{ value: "cancelled", label: getOrderStatusLabel("cancelled") },
];

function OrdersExportButton({ table }: { table: Table<OrderWithRelations> }) {
	function handleExport() {
		const visibleOrders = table.getRowModel().rows.map((row) => row.original);
		const headers = ["ID", "Cliente", "Total (Bs)", "Estado", "Fecha"];
		const rows = visibleOrders.map((o) => [
			o.id,
			o.customer?.displayName ?? o.guestName ?? "Invitado",
			o.totalAmount.toFixed(2),
			getOrderStatusLabel(o.status),
			formatDate(o.createdAt).toLocaleString(DateTime.DATETIME_MED),
		]);

		const csv = [headers, ...rows]
			.map((row) =>
				row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
			)
			.join("\n");

		const blob = new Blob(["\uFEFF" + csv], {
			type: "text/csv;charset=utf-8;",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `pedidos-${DateTime.now().toISODate()}.csv`;
		link.click();
		URL.revokeObjectURL(url);
	}

	return (
		<Button size="sm" variant="outline" onClick={handleExport}>
			<DownloadIcon className="h-4 w-4 sm:mr-2" />
			<span className="hidden sm:block">Exportar CSV</span>
		</Button>
	);
}

export default function OrdersTable({ ordersPromise, activeStatus }: OrdersTableProps) {
	const orders = use(ordersPromise);
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [optimisticStatus, setOptimisticStatus] = useOptimistic(activeStatus);
	const [period, setPeriod] = useState<DatePeriod>("all");

	const filteredOrders = useMemo(() => {
		if (period === "all") return orders;
		const now = DateTime.now().setZone("America/La_Paz");
		const cutoff =
			period === "today"
				? now.startOf("day")
				: period === "week"
					? now.startOf("week")
					: now.startOf("month");
		return orders.filter(
			(o) => formatDate(o.createdAt).toMillis() >= cutoff.toMillis(),
		);
	}, [orders, period]);

	function handleStatusChange(value: ActiveStatus) {
		startTransition(() => {
			setOptimisticStatus(value);
			router.push(`/dashboard/store/orders?status=${value}`);
		});
	}

	const periodOptions: { value: DatePeriod; label: string }[] = [
		{ value: "all", label: "Todo" },
		{ value: "month", label: "Este mes" },
		{ value: "week", label: "Esta semana" },
		{ value: "today", label: "Hoy" },
	];

	return (
		<div className={cn("transition-opacity", isPending && "opacity-60 pointer-events-none")}>
			{/* Status tabs */}
			<div className="flex gap-1 overflow-x-auto border-b mb-3 [&::-webkit-scrollbar]:hidden">
				{STATUS_OPTIONS.map((opt) => {
					const isActive = optimisticStatus === opt.value;
					return (
						<button
							key={opt.value}
							onClick={() => handleStatusChange(opt.value)}
							className={cn(
								"shrink-0 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
								isActive
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300",
							)}
						>
							{opt.label}
						</button>
					);
				})}
			</div>

			{/* Period filter + table */}
			<div className="flex items-center gap-1 mb-2">
				{periodOptions.map((opt) => (
					<Button
						key={opt.value}
						size="sm"
						variant={period === opt.value ? "default" : "ghost"}
						onClick={() => setPeriod(opt.value)}
					>
						{opt.label}
					</Button>
				))}
			</div>
			<DataTable
				columns={columns}
				data={filteredOrders}
				columnTitles={columnTitles}
				actions={(table) => (
					<div className="hidden md:flex">
						<OrdersExportButton table={table} />
					</div>
				)}
			/>
		</div>
	);
}
