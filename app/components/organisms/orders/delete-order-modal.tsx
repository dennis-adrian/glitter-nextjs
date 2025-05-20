import { Modal } from "@/app/components/atoms/modal";
import DeleteOrderForm from "@/app/components/organisms/orders/delete-order-form";
import { Button } from "@/app/components/ui/button";
import { BaseOrder } from "@/app/lib/orders/definitions";
import { AlertCircleIcon } from "lucide-react";

export default function DeleteOrderModal({
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
			<div className="flex items-center flex-col gap-6 m-auto text-center py-4">
				<AlertCircleIcon size={48} className="text-red-500" />
				<div className="flex flex-col gap-2">
					<p>¿Estás seguro que deseas eliminar este pedido ?</p>
					<p>La acción no se puede deshacer.</p>
				</div>
			</div>
			<div className="flex w-full gap-2">
				<Button
					className="w-full"
					variant="outline"
					onClick={() => setOpen(false)}
				>
					Cancelar
				</Button>
				<DeleteOrderForm order={order} onSuccess={() => setOpen(false)} />
			</div>
		</Modal>
	);
}
