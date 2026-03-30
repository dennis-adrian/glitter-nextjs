"use client";

import posthog from "posthog-js";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { confirmFreeInvoice } from "@/app/data/invoices/actions";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";
import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type ConfirmFreeReservationButtonProps = {
	invoice: InvoiceWithPaymentsAndStand;
};

export default function ConfirmFreeReservationButton({
	invoice,
}: ConfirmFreeReservationButtonProps) {
	const router = useRouter();
	const form = useForm();

	const action: () => void = form.handleSubmit(async () => {
		const res = await confirmFreeInvoice({
			invoiceId: invoice.id,
			reservationId: invoice.reservationId,
			standId: invoice.reservation.standId,
		});

		if (res.success) {
			posthog.capture(POSTHOG_EVENTS.FREE_RESERVATION_CONFIRMED, {
				invoice_id: invoice.id,
				reservation_id: invoice.reservationId,
				stand_id: invoice.reservation.standId,
			});
			toast.success("Reserva confirmada con éxito.");
			router.push(`/profiles/${invoice.userId}/invoices/${invoice.id}/success`);
		} else {
			toast.error(res.message);
		}
	});

	return (
		<Form {...form}>
			<form className="w-full mt-4" onSubmit={action}>
				<SubmitButton
					disabled={
						form.formState.isSubmitting || form.formState.isSubmitSuccessful
					}
					loading={form.formState.isSubmitting}
				>
					Confirmar reserva
					<CheckIcon className="h-4 w-4 ml-2" />
				</SubmitButton>
			</form>
		</Form>
	);
}
