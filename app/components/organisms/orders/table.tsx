"use client";

import {
	columns,
	columnTitles,
} from "@/app/components/organisms/orders/table-columns";
import OrdersDateFilter from "@/app/components/organisms/orders/orders-date-filter";
import { Button } from "@/app/components/ui/button";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { useOrdersDateFilter } from "@/app/hooks/use-orders-date-filter";
import { formatDate } from "@/app/lib/formatters";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import { getOrderStatusLabel } from "@/app/lib/orders/utils";
import { cn } from "@/lib/utils";
import type { Table } from "@tanstack/react-table";
import { DownloadIcon } from "lucide-react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { use, useOptimistic, useTransition } from "react";

type ActiveStatus = OrderStatus | "all";

type OrdersTableProps = {
	ordersPromise: Promise<OrderWithRelations[]>;
	activeStatus: ActiveStatus;
};

const STATUS_OPTIONS: { value: ActiveStatus; label: string }[] = [
	{ value: "all", label: "Todos" },
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

function OrdersExportButton({ table }: { table: Table<OrderWithRelations> }) {
	function handleExport() {
		const visibleOrders = table.getRowModel().rows.map((row) => row.original);
		const headers = [
			"ID",
			"Cliente",
			"Productos",
			"Total (Bs)",
			"Estado",
			"Fecha",
		];
		const rows = visibleOrders.map((o) => [
			o.id,
			o.customer?.displayName ?? o.guestName ?? "Invitado",
			o.orderItems.map((i) => `${i.quantity}x ${i.product.name}`).join(", "),
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

export default function OrdersTable({
	ordersPromise,
	activeStatus,
}: OrdersTableProps) {
	const orders = use(ordersPromise);
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [optimisticStatus, setOptimisticStatus] = useOptimistic(activeStatus);

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

	function handleStatusChange(value: ActiveStatus) {
		startTransition(() => {
			setOptimisticStatus(value);
			router.push(`/dashboard/store/orders?status=${value}`);
		});
	}

	return (
		<div
			className={cn(
				"transition-opacity",
				isPending && "opacity-60 pointer-events-none",
			)}
		>
			{/* Status tabs */}
			<div className="flex gap-1 overflow-x-auto border-b mb-4 [&::-webkit-scrollbar]:hidden">
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

			{/* Date filter */}
			<div className="mb-3">
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

			<DataTable
				key={optimisticStatus}
				columns={columns}
				data={filteredByDate}
				columnTitles={columnTitles}
				initialState={
					optimisticStatus !== "all"
						? { columnVisibility: { status: false } }
						: undefined
				}
				actions={(table) => <OrdersExportButton table={table} />}
			/>
		</div>
	);
}
