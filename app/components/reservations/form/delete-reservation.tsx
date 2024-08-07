"use client";

import { deleteReservation } from "@/app/api/reservations/actions";
import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";

import { useForm } from "react-hook-form";
import { Form } from "@/app/components/ui/form";
import { toast } from "sonner";
import SubmitButton from "@/app/components/simple-submit-button";

export function DeleteReservationForm({
  reservation,
  onSuccess,
}: {
  reservation: ReservationWithParticipantsAndUsersAndStand;
  onSuccess: () => void;
}) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const res = await deleteReservation(reservation.id, reservation.standId);
    if (res.success) {
      toast.success(res.message);
      onSuccess();
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form className="w-full mt-4" onSubmit={action}>
        <SubmitButton
          className="flex w-full"
          loading={form.formState.isSubmitting}
          disabled={form.formState.isSubmitting}
          variant="destructive"
        >
          Eliminar Reserva
        </SubmitButton>
      </form>
    </Form>
  );
}
