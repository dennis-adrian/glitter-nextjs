"use client";

import { rejectReservation } from "@/app/api/reservations/actions";
import { ReservationWithParticipantsAndUsersAndStandAndFestival } from "@/app/api/reservations/definitions";

import { useForm } from "react-hook-form";
import { Form } from "@/app/components/ui/form";
import SubmitButton from "@/app/components/simple-submit-button";
import TextareaInput from "@/app/components/form/fields/textarea";
import { toast } from "sonner";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const FormSchema = z.object({
  reason: z.string().trim().optional(),
});

export function RejectReservationForm({
  reservation,
  onSuccess,
}: {
  reservation: ReservationWithParticipantsAndUsersAndStandAndFestival;
  onSuccess: () => void;
}) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      reason: "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const res = await rejectReservation(reservation, data.reason);
    if (res.success) {
      toast.success(res.message);
      onSuccess();
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4 w-full" onSubmit={action}>
        <TextareaInput
          formControl={form.control}
          label="Razón de rechazo (opcional)"
          name="reason"
          placeholder="Ingresa una razón para rechazar la reserva"
          maxLength={1000}
        />
        <SubmitButton
          className="flex w-full"
          loading={form.formState.isSubmitting}
          disabled={form.formState.isSubmitting}
        >
          Rechazar Reserva
        </SubmitButton>
      </form>
    </Form>
  );
}
