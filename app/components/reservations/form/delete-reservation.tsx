import {
  ReservationWithParticipantsAndUsersAndStand,
  deleteReservation,
} from "@/app/api/reservations/actions";
import { SubmitButton } from "@/app/components/reservations/form/submit-button";
import { DropdownMenuItem } from "@/app/components/ui/dropdown-menu";
import { Trash2Icon } from "lucide-react";
import { useEffect } from "react";
import { useFormState } from "react-dom";

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
