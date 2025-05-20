"use client";

import { CheckCircleIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrderWithRelations } from "@/app/lib/orders/definitions";
import { useState } from "react";
import AcceptOrderModal from "@/app/components/organisms/orders/accept-order-modal";

export function OrdersActionsCell({ order }: { order: OrderWithRelations }) {
	const [openAcceptModal, setOpenAcceptModal] = useState(false);
	const [openRejectModal, setOpenRejectModal] = useState(false);

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
					<DropdownMenuItem onClick={() => setOpenAcceptModal(true)}>
						<CheckCircleIcon className="h-4 w-4 mr-1" />
						Aceptar Pedido
					</DropdownMenuItem>
					<DropdownMenuItem>
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
		</>
	);
}
