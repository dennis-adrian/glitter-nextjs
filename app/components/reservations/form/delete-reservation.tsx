"use client";

import { useFormState } from "react-dom";
import { deleteReservation } from "@/app/api/reservations/actions";
import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";

import { SubmitButton } from "@/components/submit-button";

export function DeleteReservationForm({
  reservation,
  onSuccess,
}: {
  reservation: ReservationWithParticipantsAndUsersAndStand;
  onSuccess: () => void;
}) {
  const initialState = {
    message: "",
    success: false,
  };
  const deleteReservationWithIds = deleteReservation.bind(
    null,
    reservation.id,
    reservation.standId,
  );
  const [state, action] = useFormState(deleteReservationWithIds, initialState);

  if (state.success) onSuccess();

  return (
    <form className="w-full mt-4" action={action}>
      <SubmitButton
        className="flex w-full"
        formState={state}
        variant="destructive"
        size="sm"
      >
        Eliminar Reserva
      </SubmitButton>
    </form>
  );
}
