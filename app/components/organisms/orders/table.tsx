"use client";

import {
	columns,
	columnTitles,
} from "@/app/components/organisms/orders/table-columns";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import { use } from "react";

type OrdersTableProps = {
	ordersPromise: Promise<OrderWithRelations[]>;
};

export default function OrdersTable(props: OrdersTableProps) {
	const orders = use(props.ordersPromise);

	return (
		<DataTable
			columns={columns}
			data={orders}
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
		/>
	);
}
