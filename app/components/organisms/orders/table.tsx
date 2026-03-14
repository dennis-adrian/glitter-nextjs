"use client";

import {
	columns,
	columnTitles,
} from "@/app/components/organisms/orders/table-columns";
import { Button } from "@/app/components/ui/button";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { formatDate } from "@/app/lib/formatters";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import { getOrderStatusLabel } from "@/app/lib/orders/utils";
import { DownloadIcon } from "lucide-react";
import { DateTime } from "luxon";
import { use, useMemo, useState } from "react";

type DatePeriod = "all" | "today" | "week" | "month";

type OrdersTableProps = {
	ordersPromise: Promise<OrderWithRelations[]>;
};

function OrdersExportButton({ orders }: { orders: OrderWithRelations[] }) {
	function handleExport() {
		const headers = ["ID", "Cliente", "Total (Bs)", "Estado", "Fecha"];
		const rows = orders.map((o) => [
			o.id,
			o.customer.displayName ?? "",
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

export default function OrdersTable(props: OrdersTableProps) {
	const orders = use(props.ordersPromise);
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

	const periodOptions: { value: DatePeriod; label: string }[] = [
		{ value: "all", label: "Todo" },
		{ value: "month", label: "Este mes" },
		{ value: "week", label: "Esta semana" },
		{ value: "today", label: "Hoy" },
	];

	return (
		<div>
			<div className="hidden md:flex items-center gap-1 mb-2">
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
				filters={[
					{
						columnId: "status",
						label: "Estado del pedido",
						options: [
							{
								label: "Pendiente",
								value: "pending",
							},
							{
								label: "Pago en verificación",
								value: "payment_verification",
							},
							{
								label: "En proceso",
								value: "processing",
							},
							{
								label: "Pagado",
								value: "paid",
							},
							{
								label: "Entregado",
								value: "delivered",
							},
							{
								label: "Cancelado",
								value: "cancelled",
							},
						],
					},
				]}
				actions={
					<div className="hidden md:flex">
						<OrdersExportButton orders={filteredOrders} />
					</div>
				}
			/>
		</div>
	);
}
