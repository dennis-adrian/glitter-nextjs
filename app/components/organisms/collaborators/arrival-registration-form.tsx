import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { FestivalDate } from "@/app/data/festivals/definitions";
import { registerArrival } from "@/app/lib/collaborators/actions";
import { ReservationCollaborationWithRelations } from "@/app/lib/collaborators/definitions";
import { DateTime } from "luxon";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function ArrivalRegistrationForm({
  reservationCollaboration,
  festivalDate,
  children,
}: {
  reservationCollaboration: ReservationCollaborationWithRelations;
  festivalDate: FestivalDate;
  children: React.ReactNode;
}) {
  const form = useForm();
  const isToday = DateTime.now()
    .startOf("day")
    .equals(DateTime.fromJSDate(festivalDate.startDate).startOf("day"));
  const isArrivalRegistered =
    reservationCollaboration.collaboratorsAttendanceLogs.some(
      (log) => log.festivalDateId === festivalDate.id,
    );

  const action: () => void = form.handleSubmit(async () => {
    const { success, message } = await registerArrival(
      reservationCollaboration.id,
      festivalDate.id,
    );
    if (success) {
      toast.success(message);
    } else {
      toast.error(message);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={action}>
        <SubmitButton
          className="py-0 px-2 hover:translate-y-0"
          variant="ghost"
          size="sm"
          disabled={
            form.formState.isSubmitting || !isToday || isArrivalRegistered
          }
          loading={form.formState.isSubmitting}
          loadingLabel="Registrando llegada"
        >
          {children}
        </SubmitButton>
      </form>
    </Form>
  );
}
