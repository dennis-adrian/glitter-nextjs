import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { registerArrival } from "@/app/lib/collaborators/actions";
import { ReservationCollaborationWithRelations } from "@/app/lib/collaborators/definitions";
import { FileClockIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function ArrivalRegistrationForm({
  reservationCollaboration,
}: {
  reservationCollaboration: ReservationCollaborationWithRelations;
}) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const { success, message } = await registerArrival(
      reservationCollaboration.id,
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
          disabled={form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
          loadingLabel="Registrando llegada"
        >
          <FileClockIcon className="h-4 w-4 mr-1" />
          Registrar llegada
        </SubmitButton>
      </form>
    </Form>
  );
}
