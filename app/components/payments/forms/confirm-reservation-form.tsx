"use client";

import { useFormState } from "react-dom";

import { SubmitButton } from "@/components/submit-button";
import { confirmReservation } from "@/app/api/reservations/actions";

type ConfirmReservationFormProps = {
  reservationId: number;
  userEmail: string;
  onSuccess: () => void;
};
export function ConfirmReservationForm(props: ConfirmReservationFormProps) {
  const initialState = {
    message: "",
    success: false,
  };
  const confirmReservationWithIdAndEmail = confirmReservation.bind(
    null,
    props.reservationId,
    props.userEmail,
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
