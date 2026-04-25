"use client";

import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { createPayment } from "@/app/data/invoices/actions";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";
import { SendHorizonal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type UploadPaymentVoucherFormProps = {
	invoice: InvoiceWithPaymentsAndStand;
	newVoucherUrl?: string;
	loading: boolean;
	disabled: boolean;
	hideSubmitButton: boolean;
};
export default function UploadPaymentVoucherForm(
	props: UploadPaymentVoucherFormProps,
) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const form = useForm();

	const action: () => void = form.handleSubmit(() => {
		const payment = props.invoice.payments[props.invoice.payments.length - 1];
		const voucherUrl = props.newVoucherUrl;
		if (!voucherUrl) {
			toast.error("Se necesita un comprobante para confirmar el pago");
			return;
		}

		startTransition(async () => {
			try {
				const res = await createPayment({
					payment: {
						id: payment?.id,
						date: new Date(),
						amount: props.invoice.amount,
						invoiceId: props.invoice.id,
						voucherUrl,
					},
					oldVoucherUrl: payment?.voucherUrl,
					reservationId: props.invoice.reservationId,
					standId: props.invoice.reservation.standId,
				});

				if (res.success) {
					toast.success("Pago enviado con éxito.");
					router.push(
						`/profiles/${props.invoice.userId}/invoices/${props.invoice.id}/success`,
					);
				} else {
					toast.error("Error al enviar el pago");
				}
			} catch {
				toast.error("Error al enviar el pago");
			}
		});
	});

	if (props.hideSubmitButton) {
		return null;
	}

	return (
		<Form {...form}>
			<form className="w-full max-w-80 mt-4 mx-auto" onSubmit={action}>
				<div className="flex flex-col gap-4">
					<SubmitButton
						disabled={
							form.formState.isSubmitting ||
							form.formState.isSubmitSuccessful ||
							isPending ||
							props.disabled ||
							props.loading
						}
						loading={form.formState.isSubmitting || isPending || props.loading}
					>
						Confirmar pago
						<SendHorizonal className="h-4 w-4 ml-2" />
					</SubmitButton>
				</div>
			</form>
		</Form>
	);
}
