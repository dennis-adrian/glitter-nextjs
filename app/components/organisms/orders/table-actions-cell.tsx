"use client";

import {
	BanIcon,
	CheckCheckIcon,
	CheckCircleIcon,
	MoreHorizontalIcon,
	Trash2Icon,
	TruckIcon,
} from "lucide-react";

import DeleteOrderModal from "@/app/components/organisms/orders/delete-order-modal";
import { Button } from "@/app/components/ui/button";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import UpdateOrderStatusModal from "@/app/components/organisms/orders/update-order-status-modal";

export function OrdersActionsCell({ order }: { order: OrderWithRelations }) {
	const [openDeleteModal, setOpenDeleteModal] = useState(false);
	const [actionStatus, setActionStatus] = useState<OrderStatus | null>(null);
	const [openUpdateOrderStatusModal, setOpenUpdateOrderStatusModal] =
		useState(false);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" className="h-8 w-8 p-0">
						<span className="sr-only">Open menu</span>
						<MoreHorizontalIcon className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuLabel>Acciones</DropdownMenuLabel>
					<DropdownMenuSeparator />
					{order.status === "pending" && (
						<DropdownMenuItem
							onClick={() => {
								setActionStatus("processing");
								setOpenUpdateOrderStatusModal(true);
							}}
						>
							<CheckCircleIcon className="h-4 w-4 mr-1" />
							Aceptar pedido
						</DropdownMenuItem>
					)}
					{order.status === "processing" && (
						<DropdownMenuItem
							onClick={() => {
								setActionStatus("paid");
								setOpenUpdateOrderStatusModal(true);
							}}
						>
							<CheckCheckIcon className="h-4 w-4 mr-1" />
							Confirmar pago
						</DropdownMenuItem>
					)}
					{order.status === "paid" && (
						<DropdownMenuItem
							onClick={() => {
								setActionStatus("delivered");
								setOpenUpdateOrderStatusModal(true);
							}}
						>
							<TruckIcon className="h-4 w-4 mr-1" />
							Marcar como entregado
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						onClick={() => {
							setActionStatus("cancelled");
							setOpenUpdateOrderStatusModal(true);
						}}
					>
						<BanIcon className="h-4 w-4 mr-1 " />
						<span>Cancelar pedido</span>
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => setOpenDeleteModal(true)}>
						<Trash2Icon className="h-4 w-4 mr-1" />
						<span>Eliminar pedido</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<DeleteOrderModal
				order={order}
				open={openDeleteModal}
				setOpen={setOpenDeleteModal}
			/>
			<UpdateOrderStatusModal
				order={order}
				open={openUpdateOrderStatusModal}
				newStatus={actionStatus}
				setOpen={setOpenUpdateOrderStatusModal}
			/>
		</>
	);
}
