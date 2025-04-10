import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { deleteReservationCollaborator } from "@/app/lib/reservations/actions";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type RemoveCollaboratorFormProps = {
  reservationId: number;
  collaboratorId: number;
};

export default function RemoveCollaboratorForm({
  reservationId,
  collaboratorId,
}: RemoveCollaboratorFormProps) {
  const form = useForm();

  const action = form.handleSubmit(async (data) => {
    const action = await deleteReservationCollaborator(
      reservationId,
      collaboratorId,
    );
    if (action.success) {
      toast.success(action.message);
    } else {
      toast.error(action.message);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={action}>
        <SubmitButton
          variant="ghost"
          size="sm"
          className="text-gray-500 hover:text-rose-500 hover:bg-rose-500/10"
          disabled={form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
          loadingComponent={<Loader2Icon className="w-4 h-4 animate-spin" />}
        >
          <Trash2Icon className="h-4 w-4" />
        </SubmitButton>
      </form>
    </Form>
  );
}
