import OrderStatusBadge from "@/app/components/atoms/order-status-badge";
import { OrdersActionsCell } from "@/app/components/organisms/orders/table-actions-cell";
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
	status: "Estado",
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
		id: "customer",
		accessorFn: (row) => row.customer.displayName,
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
		id: "items",
		accessorFn: (row) => {
			const items = row.orderItems.map((item) => item.product.name);
			return items.join(", ");
		},
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
		accessorKey: "status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.status} />
		),
		cell: ({ row }) => {
			return <OrderStatusBadge status={row.original.status} />;
		},
		filterFn: (row, columnId, filterStatus) => {
			if (filterStatus.length === 0) return true;
			return filterStatus.includes(row.original.status);
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
	{
		accessorKey: "actions",
		header: ({ column }) => <DataTableColumnHeader column={column} title="" />,
		cell: ({ row }) => {
			return <OrdersActionsCell order={row.original} />;
		},
		enableSorting: false,
		enableHiding: false,
	},
];
