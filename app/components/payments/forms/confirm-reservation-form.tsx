"use client";

import { useFormState } from "react-dom";

import { SubmitButton } from "@/components/submit-button";
import { confirmReservation } from "@/app/api/reservations/actions";
import { InvoiceWithPaymentsAndStandAndProfile } from "@/app/data/invoices/defiinitions";

type ConfirmReservationFormProps = {
  invoice: InvoiceWithPaymentsAndStandAndProfile;
  onSuccess: () => void;
};
export function ConfirmReservationForm(props: ConfirmReservationFormProps) {
  const initialState = {
    message: "",
    success: false,
  };
  const confirmReservationWithIdAndEmail = confirmReservation.bind(
    null,
    props.invoice.reservationId,
    props.invoice.user,
    props.invoice.reservation.standId,
    `${props.invoice.reservation.stand.label}${props.invoice.reservation.stand.standNumber}`,
    props.invoice.reservation.festivalId,
  );
  const [state, action] = useFormState(
    confirmReservationWithIdAndEmail,
    initialState,
  );

  if (state.success) props.onSuccess();

  return (
    <form className="w-full mt-4" action={action}>
      <SubmitButton
        className="flex w-full"
        formState={state}
        variant="default"
        size="sm"
      >
        Verificar Usuario
      </SubmitButton>
    </form>
  );
}
