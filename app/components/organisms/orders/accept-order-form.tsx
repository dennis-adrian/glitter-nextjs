"use client";

import { BaseOrder } from "@/app/lib/orders/definitions";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import SubmitButton from "@/app/components/simple-submit-button";
import { acceptOrder } from "@/app/lib/orders/actions";
import { toast } from "sonner";

type AcceptOrderFormProps = {
	order: BaseOrder;
	onSuccess: () => void;
};

export default function AcceptOrderForm({
	order,
	onSuccess,
}: AcceptOrderFormProps) {
	const form = useForm();

	const action: () => void = form.handleSubmit(async () => {
		const result = await acceptOrder(order.id);
		if (result.success) {
			toast.success(result.message);
			onSuccess();
		} else {
			toast.error(result.message);
		}
	});

	return (
		<Form {...form}>
			<form className="w-full" onSubmit={action}>
				<SubmitButton
					disabled={form.formState.isSubmitting}
					loading={form.formState.isSubmitting}
					loadingLabel="Aceptando pedido..."
				>
					Aceptar Pedido
				</SubmitButton>
			</form>
		</Form>
	);
}
