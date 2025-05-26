"use client";

import {
	CheckCheckIcon,
	CheckCircleIcon,
	MoreHorizontalIcon,
	Trash2Icon,
} from "lucide-react";

import AcceptOrderModal from "@/app/components/organisms/orders/accept-order-modal";
import ConfirmPaymentModal from "@/app/components/organisms/orders/confirm-payment-modal";
import DeleteOrderModal from "@/app/components/organisms/orders/delete-order-modal";
import { Button } from "@/app/components/ui/button";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

export function OrdersActionsCell({ order }: { order: OrderWithRelations }) {
	const [openAcceptModal, setOpenAcceptModal] = useState(false);
	const [openDeleteModal, setOpenDeleteModal] = useState(false);
	const [openConfirmPaymentModal, setOpenConfirmPaymentModal] = useState(false);

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
						<DropdownMenuItem onClick={() => setOpenAcceptModal(true)}>
							<CheckCircleIcon className="h-4 w-4 mr-1" />
							Aceptar pedido
						</DropdownMenuItem>
					)}
					{order.status === "processing" && (
						<DropdownMenuItem onClick={() => setOpenConfirmPaymentModal(true)}>
							<CheckCheckIcon className="h-4 w-4 mr-1" />
							Confirmar pago
						</DropdownMenuItem>
					)}
					<DropdownMenuItem onClick={() => setOpenDeleteModal(true)}>
						<Trash2Icon className="h-4 w-4 mr-1" />
						Eliminar
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AcceptOrderModal
				order={order}
				open={openAcceptModal}
				setOpen={setOpenAcceptModal}
			/>
			<DeleteOrderModal
				order={order}
				open={openDeleteModal}
				setOpen={setOpenDeleteModal}
			/>
			<ConfirmPaymentModal
				order={order}
				open={openConfirmPaymentModal}
				setOpen={setOpenConfirmPaymentModal}
			/>
		</>
	);
}
