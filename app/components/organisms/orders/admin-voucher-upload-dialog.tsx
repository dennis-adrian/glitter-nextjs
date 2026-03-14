"use client";

import { useState } from "react";
import { toast } from "sonner";

import PaymentProofUpload from "@/app/components/payments/payment-proof-upload";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/app/components/ui/dialog";
import { adminAttachOrderVoucher } from "@/app/lib/orders/actions";
import { BaseOrder } from "@/app/lib/orders/definitions";

export default function AdminVoucherUploadDialog({
	order,
	open,
	setOpen,
}: {
	order: BaseOrder;
	open: boolean;
	setOpen: (open: boolean) => void;
}) {
	const [isUploading, setIsUploading] = useState(false);
	const orderLabel = `Orden #${String(order.id).padStart(3, "0")}`;

	async function handleUploadComplete(imageUrl: string) {
		const result = await adminAttachOrderVoucher(order.id, imageUrl);
		if (result.success) {
			toast.success(result.message);
			setOpen(false);
		} else {
			toast.error(result.message);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!isUploading) setOpen(next);
			}}
		>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Subir comprobante</DialogTitle>
					<DialogDescription>{orderLabel}</DialogDescription>
				</DialogHeader>
				{order.paymentVoucherUrl && (
					<p className="text-xs text-muted-foreground -mt-2">
						Este pedido ya tiene un comprobante. Al subir uno nuevo lo
						reemplazará.
					</p>
				)}
				<PaymentProofUpload
					endpoint="storeOrderPayment"
					submitLabel="Guardar comprobante"
					onUploadComplete={handleUploadComplete}
					onUploading={setIsUploading}
				/>
			</DialogContent>
		</Dialog>
	);
}
