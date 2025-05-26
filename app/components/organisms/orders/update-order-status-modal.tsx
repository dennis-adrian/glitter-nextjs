import { Modal } from "@/app/components/atoms/modal";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { updateOrderStatus } from "@/app/lib/orders/actions";
import { BaseOrder, OrderStatus } from "@/app/lib/orders/definitions";
import { AlertCircleIcon } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function UpdateOrderStatusModal({
	order,
	open,
	newStatus,
	setOpen,
}: {
	order: BaseOrder;
	open: boolean;
	newStatus: OrderStatus | null;
	setOpen: (open: boolean) => void;
}) {
	const form = useForm();

	const message = useMemo(() => {
		switch (newStatus) {
			case "processing":
				return `¿Estás seguro que deseas aceptar el pedido #${order.id}?`;
			case "paid":
				return `¿Estás seguro que deseas confirmar el pago del pedido #${order.id}?`;
			case "delivered":
				return `¿Estás seguro que deseas marcar el pedido #${order.id} como entregado?`;
			case "cancelled":
				return `¿Estás seguro que deseas cancelar el pedido #${order.id}?`;
			default:
				return `¿Estás seguro que deseas actualizar el estado del pedido #${order.id}?`;
		}
	}, [newStatus, order.id]);

	if (!newStatus) return null;

	const action: () => void = form.handleSubmit(async () => {
		const result = await updateOrderStatus(order.id, newStatus);
		if (result.success) {
			toast.success(result.message);
			setOpen(false);
		} else {
			toast.error(result.message);
		}
	});

	return (
		<Modal isOpen={open} onClose={() => setOpen(false)}>
			<div className="flex items-center flex-col gap-6 m-auto text-center py-4">
				{newStatus === "cancelled" ? (
					<AlertCircleIcon size={48} className="text-red-500" />
				) : (
					<AlertCircleIcon size={48} className="text-amber-500" />
				)}
				<div className="flex flex-col gap-2">
					<p>{message}</p>
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
				<Form {...form}>
					<form className="w-full" onSubmit={action}>
						<SubmitButton
							disabled={form.formState.isSubmitting}
							loading={form.formState.isSubmitting}
							loadingLabel="Actualizando..."
						>
							Continuar
						</SubmitButton>
					</form>
				</Form>
			</div>
		</Modal>
	);
}
