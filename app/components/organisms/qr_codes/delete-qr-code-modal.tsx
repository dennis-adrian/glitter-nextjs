"use client";

import { Modal } from "@/app/components/atoms/modal";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { deleteQrCode } from "@/app/lib/qr_codes/actions";
import type { QrCodeBase } from "@/app/lib/qr_codes/definitions";
import { AlertCircleIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type Props = {
	qrCode: QrCodeBase;
	open: boolean;
	setOpen: (open: boolean) => void;
};

export default function DeleteQrCodeModal({ qrCode, open, setOpen }: Props) {
	const form = useForm();

	const action = form.handleSubmit(async () => {
		try {
			const result = await deleteQrCode(qrCode.id);
			if (result.success) {
				toast.success(result.message);
				if (result.fileDeletionError) {
					toast.warning(result.fileDeletionError);
				}
				setOpen(false);
			} else {
				toast.error(result.message);
			}
		} catch {
			toast.error("Error al eliminar el código QR");
		}
	});

	return (
		<Modal isOpen={open} onClose={() => setOpen(false)}>
			<div className="m-auto flex flex-col items-center gap-6 py-4 text-center">
				<AlertCircleIcon size={48} className="text-red-500" />
				<div className="flex flex-col gap-2">
					<p>
						¿Estás seguro que deseas eliminar el código QR de{" "}
						<strong>Bs {qrCode.amount}</strong>?
					</p>
					<p className="text-sm text-muted-foreground">
						La acción no se puede deshacer y la imagen será eliminada del
						almacenamiento.
					</p>
				</div>
			</div>
			<div className="flex w-full gap-2">
				<Button
					className="min-h-10 w-full"
					variant="outline"
					onClick={() => setOpen(false)}
				>
					Cancelar
				</Button>
				<Form {...form}>
					<form className="w-full" onSubmit={action}>
						<SubmitButton
							className="min-h-10 w-full"
							variant="destructive"
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
