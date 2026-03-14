"use client";

import { Modal } from "@/app/components/atoms/modal";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { deleteProduct } from "@/app/lib/products/actions";
import { BaseProduct } from "@/app/lib/products/definitions";
import { AlertCircleIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function DeleteProductModal({
	product,
	open,
	setOpen,
}: {
	product: BaseProduct;
	open: boolean;
	setOpen: (open: boolean) => void;
}) {
	const form = useForm();

	const action = form.handleSubmit(async () => {
		const result = await deleteProduct(product.id);
		if (result.success) {
			toast.success(result.message);
			setOpen(false);
		} else {
			toast.error(result.message);
		}
	});

	return (
		<Modal isOpen={open} onClose={() => setOpen(false)}>
			<div className="flex flex-col items-center gap-6 m-auto text-center py-4">
				<AlertCircleIcon size={48} className="text-red-500" />
				<div className="flex flex-col gap-2">
					<p>
						¿Estás seguro que deseas eliminar <strong>{product.name}</strong>?
					</p>
					<p className="text-sm text-muted-foreground">
						La acción no se puede deshacer.
					</p>
				</div>
			</div>
			<div className="flex w-full gap-2">
				<Button
					className="w-full min-h-10"
					variant="outline"
					onClick={() => setOpen(false)}
				>
					Cancelar
				</Button>
				<Form {...form}>
					<form className="w-full" onSubmit={action}>
						<SubmitButton
							className="w-full min-h-10"
							disabled={form.formState.isSubmitting}
							loading={form.formState.isSubmitting}
							loadingLabel="Eliminando..."
						>
							Eliminar
						</SubmitButton>
					</form>
				</Form>
			</div>
		</Modal>
	);
}
