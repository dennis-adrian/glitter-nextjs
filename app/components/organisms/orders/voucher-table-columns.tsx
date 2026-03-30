import { ColumnDef } from "@tanstack/react-table";
import { EyeIcon } from "lucide-react";

import ProfileQuickViewInfo from "@/app/components/users/profile-quick-view-info";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { Button } from "@/app/components/ui/button";
import { formatDateWithTime } from "@/app/lib/formatters";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import OrderVoucherReviewDialog from "@/app/components/organisms/orders/order-voucher-review-dialog";

export const voucherColumnTitles = {
	order: "Pedido",
	customer: "Cliente",
	items: "Productos",
	total: "Total",
	voucherSubmittedAt: "Subido",
	actions: "Acciones",
};

export const voucherColumns: ColumnDef<OrderWithRelations>[] = [
	{
		id: "order",
		accessorFn: (row) => row.id,
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={voucherColumnTitles.order}
			/>
		),
		cell: ({ row }) => (
			<span className="font-medium">
				#{String(row.original.id).padStart(3, "0")}
			</span>
		),
	},
	{
		id: "customer",
		accessorFn: (row) =>
			row.customer?.displayName ?? row.guestName ?? "Invitado",
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={voucherColumnTitles.customer}
			/>
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
		id: "items",
		accessorFn: (row) =>
			row.orderItems.map((item) => item.product.name).join(", "),
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={voucherColumnTitles.items}
			/>
		),
		cell: ({ row }) => (
			<ul className="flex min-w-60 flex-col gap-1 text-sm">
				{row.original.orderItems.map((item) => (
					<li key={item.id} className="text-muted-foreground">
						<span className="font-medium text-foreground">
							{item.quantity}x
						</span>{" "}
						{item.product.name}
					</li>
				))}
			</ul>
		),
	},
	{
		id: "total",
		accessorFn: (row) => row.totalAmount,
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={voucherColumnTitles.total}
			/>
		),
		cell: ({ row }) => (
			<span className="font-semibold">
				Bs. {row.original.totalAmount.toFixed(2)}
			</span>
		),
	},
	{
		id: "voucherSubmittedAt",
		accessorFn: (row) => row.voucherSubmittedAt,
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={voucherColumnTitles.voucherSubmittedAt}
			/>
		),
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{row.original.voucherSubmittedAt
					? formatDateWithTime(row.original.voucherSubmittedAt)
					: "—"}
			</span>
		),
	},
	{
		id: "actions",
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={voucherColumnTitles.actions}
			/>
		),
		cell: ({ row }) => (
			<div className="flex justify-end">
				<OrderVoucherReviewDialog
					order={row.original}
					trigger={
						<Button variant="outline" size="sm">
							<EyeIcon className="mr-2 h-4 w-4" />
							Revisar
						</Button>
					}
				/>
			</div>
		),
		enableSorting: false,
		enableHiding: false,
	},
];
