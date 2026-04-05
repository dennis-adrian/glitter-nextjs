"use client";

import UpdateOrderStatusModal from "@/app/components/organisms/orders/update-order-status-modal";
import { Button } from "@/app/components/ui/button";
import { OrderStatus, OrderWithRelations } from "@/app/lib/orders/definitions";
import {
	BanIcon,
	CheckCheckIcon,
	CheckCircleIcon,
	TruckIcon,
} from "lucide-react";
import { useState } from "react";

type PrimaryAction = {
	label: string;
	icon: React.ElementType;
	newStatus: OrderStatus;
};

function getPrimaryAction(status: OrderStatus): PrimaryAction | null {
	switch (status) {
		case "pending":
			return {
				label: "Aceptar pedido",
				icon: CheckCircleIcon,
				newStatus: "processing",
			};
		case "payment_verification":
			return {
				label: "Aprobar pago",
				icon: CheckCheckIcon,
				newStatus: "paid",
			};
		case "processing":
			return {
				label: "Confirmar pago",
				icon: CheckCheckIcon,
				newStatus: "paid",
			};
		case "paid":
			return {
				label: "Marcar como entregado",
				icon: TruckIcon,
				newStatus: "delivered",
			};
		default:
			return null;
	}
}

export default function OrderDetailActions({
	order,
}: {
	order: OrderWithRelations;
}) {
	const [actionStatus, setActionStatus] = useState<OrderStatus | null>(null);
	const [openModal, setOpenModal] = useState(false);

	const primary = getPrimaryAction(order.status);
	const canCancel = !["cancelled", "delivered"].includes(order.status);

	if (!primary && !canCancel) return null;

	function trigger(status: OrderStatus) {
		setActionStatus(status);
		setOpenModal(true);
	}

	return (
		<>
			<div className="flex flex-col gap-2 sm:flex-row">
				{primary && (
					<Button className="flex-1" onClick={() => trigger(primary.newStatus)}>
						<primary.icon className="h-4 w-4 mr-2" />
						{primary.label}
					</Button>
				)}
				{canCancel && (
					<Button
						variant="outline"
						className="text-destructive border-destructive/30 hover:bg-destructive/10"
						onClick={() => trigger("cancelled")}
					>
						<BanIcon className="h-4 w-4 mr-2" />
						Cancelar pedido
					</Button>
				)}
			</div>

			<UpdateOrderStatusModal
				order={order}
				open={openModal}
				newStatus={actionStatus}
				setOpen={setOpenModal}
			/>
		</>
	);
}
