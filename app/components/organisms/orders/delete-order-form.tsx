import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { deleteOrder } from "@/app/lib/orders/actions";
import { BaseOrder } from "@/app/lib/orders/definitions";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function DeleteOrderForm({
	order,
	onSuccess,
}: {
	order: BaseOrder;
	onSuccess: () => void;
}) {
	const form = useForm();

	const action: () => void = form.handleSubmit(async () => {
		const result = await deleteOrder(order.id);
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
					loadingLabel="Eliminando..."
				>
					Eliminar
				</SubmitButton>
			</form>
		</Form>
	);
}
