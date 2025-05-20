"use client";

import { Modal } from "@/app/components/atoms/modal";
import AcceptOrderForm from "@/app/components/organisms/orders/accept-order-form";
import { BaseOrder } from "@/app/lib/orders/definitions";
import { Button } from "@/components/ui/button";
import { AlertCircleIcon } from "lucide-react";

export default function AcceptOrderModal({
	order,
	open,
	setOpen,
}: {
	order: BaseOrder;
	open: boolean;
	setOpen: (open: boolean) => void;
}) {
	return (
		<Modal isOpen={open} onClose={() => setOpen(false)}>
			<div className="flex flex-col items-center gap-3 text-center my-4">
				<AlertCircleIcon size={48} className="text-amber-500" />
				<div className="flex flex-col gap-2">
					<p>¿Te gustaría aceptar este pedido?</p>
				</div>
				<div className="flex w-full gap-2">
					<Button
						className="w-full"
						variant="outline"
						onClick={() => setOpen(false)}
					>
						Cancelar
					</Button>
					<AcceptOrderForm order={order} onSuccess={() => setOpen(false)} />
				</div>
			</div>
		</Modal>
	);
}
