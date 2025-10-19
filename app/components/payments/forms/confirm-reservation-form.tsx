"use client";

import { confirmReservation } from "@/app/api/reservations/actions";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { useForm } from "react-hook-form";
import { Form } from "@/app/components/ui/form";
import { toast } from "sonner";
import SubmitButton from "@/app/components/simple-submit-button";

type ConfirmReservationFormProps = {
	invoice: InvoiceWithParticipants;
	onSuccess: () => void;
};
export function ConfirmReservationForm(props: ConfirmReservationFormProps) {
	const form = useForm();

	const action = form.handleSubmit(async () => {
		const result = await confirmReservation(
			props.invoice.reservationId,
			props.invoice.user,
			props.invoice.reservation.standId,
			`${props.invoice.reservation.stand.label}${props.invoice.reservation.stand.standNumber}`,
			props.invoice.reservation.festival,
			props.invoice.reservation.participants,
		);
		if (result.success) {
			toast.success("Reserva confirmada");
			props.onSuccess();
			form.reset();
		} else {
			toast.error(result.message);
		}
	});

	return (
		<Form {...form}>
			<form className="w-full mt-4" onSubmit={action}>
				<SubmitButton
					disabled={form.formState.isSubmitting}
					loading={form.formState.isSubmitting}
					label="Confirmar reserva"
				/>
			</form>
		</Form>
	);
}
