import { Modal } from "@/app/components/atoms/modal";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { updateOrderStatus } from "@/app/lib/orders/actions";
import { BaseOrder } from "@/app/lib/orders/definitions";
import { AlertCircleIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function ConfirmPaymentModal({
	order,
	open,
	setOpen,
}: {
	order: BaseOrder;
	open: boolean;
	setOpen: (open: boolean) => void;
}) {
	const form = useForm();

	const action: () => void = form.handleSubmit(async () => {
		const result = await updateOrderStatus(order.id, "paid");
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
				<AlertCircleIcon size={48} className="text-amber-500" />
				<div className="flex flex-col gap-2">
					<p>
						¿Estás seguro que deseas confirmar el pago del pedido #{order.id}?
					</p>
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
							loadingLabel="Confirmando..."
						>
							Confirmar pago
						</SubmitButton>
					</form>
				</Form>
			</div>
		</Modal>
	);
}
