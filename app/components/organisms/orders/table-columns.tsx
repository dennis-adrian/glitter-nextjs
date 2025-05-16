import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import ProfileQuickViewInfo from "@/app/components/users/profile-quick-view-info";
import { formatDate } from "@/app/lib/formatters";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import { ColumnDef } from "@tanstack/react-table";
import { DateTime } from "luxon";

export const columnTitles = {
	id: "ID",
	customer: "Cliente",
	createdAt: "Fecha de creación",
	items: "Artículos",
	total: "Total",
};

export const columns: ColumnDef<OrderWithRelations>[] = [
	{
		accessorKey: "id",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.id} />
		),
	},
	{
		accessorKey: "customer",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.customer} />
		),
		cell: ({ row }) => {
			return (
				<ProfileQuickViewInfo
					showAdminControls
					truncateEmail
					profile={row.original.customer}
				/>
			);
		},
	},
	{
		accessorKey: "total",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.total} />
		),
		cell: ({ row }) => {
			return <div>Bs{row.original.totalAmount.toFixed(2)}</div>;
		},
	},
	{
		accessorKey: "items",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.items} />
		),
		cell: ({ row }) => {
			return (
				<ul className="flex flex-col gap-2">
					{row.original.orderItems.map((item) => (
						<li key={item.id}>
							{item.quantity} x {item.product.name}
						</li>
					))}
				</ul>
			);
		},
	},
	{
		accessorKey: "createdAt",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.createdAt} />
		),
		cell: ({ row }) => {
			return (
				<span className="capitalize">
					{formatDate(row.original.createdAt).toLocaleString(
						DateTime.DATETIME_MED_WITH_WEEKDAY,
					)}
				</span>
			);
		},
	},
];
