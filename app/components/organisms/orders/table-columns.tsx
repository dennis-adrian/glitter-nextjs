import OrderStatusBadge from "@/app/components/atoms/order-status-badge";
import { OrdersActionsCell } from "@/app/components/organisms/orders/table-actions-cell";
import OrderVoucherDialog from "@/app/components/organisms/orders/order-voucher-dialog";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import ProfileQuickViewInfo from "@/app/components/users/profile-quick-view-info";
import { formatDate, STORE_TIMEZONE } from "@/app/lib/formatters";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import { cn } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { AlertTriangleIcon } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";

export const columnTitles = {
	id: "ID",
	customer: "Cliente",
	createdAt: "Fecha de creación",
	paymentDueDate: "Fecha límite de pago",
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
		cell: ({ row }) => (
			<Link
				href={`/dashboard/store/orders/${row.original.id}`}
				className="font-medium text-primary hover:underline"
			>
				#{row.original.id}
			</Link>
		),
	},
	{
		id: "customer",
		accessorFn: (row) =>
			row.customer?.displayName ?? row.guestName ?? "Invitado",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.customer} />
		),
		cell: ({ row }) => {
			const customer = row.original.customer;
			if (!customer) {
				return (
					<div className="text-sm">
						<p className="font-medium">{row.original.guestName ?? "Invitado"}</p>
						<p className="text-muted-foreground text-xs">
							{row.original.guestEmail ?? ""}
						</p>
					</div>
				);
			}
			return (
				<ProfileQuickViewInfo
					showAdminControls
					truncateEmail
					profile={customer}
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
			const { status, paymentVoucherUrl, id } = row.original;
			return (
				<div className="flex items-center gap-2">
					<OrderStatusBadge status={status} />
					{paymentVoucherUrl && (
						<OrderVoucherDialog voucherUrl={paymentVoucherUrl} orderId={id} />
					)}
				</div>
			);
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
		accessorKey: "paymentDueDate",
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={columnTitles.paymentDueDate}
			/>
		),
		cell: ({ row }) => {
			const { paymentDueDate, status } = row.original;
			if (!paymentDueDate) {
				return <span className="text-muted-foreground">—</span>;
			}
			const dueInStore = formatDate(paymentDueDate);
			const nowInStore = DateTime.now().setZone(STORE_TIMEZONE);
			const isOverdue =
				dueInStore < nowInStore &&
				(status === "pending" || status === "payment_verification");
			return (
				<span
					className={cn(
						"flex items-center gap-1 capitalize",
						isOverdue && "font-medium text-red-600",
					)}
				>
					{isOverdue && <AlertTriangleIcon className="h-3 w-3 shrink-0" />}
					{formatDate(paymentDueDate).toLocaleString(DateTime.DATETIME_MED)}
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
