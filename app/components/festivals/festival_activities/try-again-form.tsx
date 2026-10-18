import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { addFestivalActivityParticipantProof } from "@/app/lib/festival_activites/actions";
import type { SignedActivityProofUpload } from "@/app/lib/festival_activites/definitions";
import { CloudUploadIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type TryAgainFormProps = {
  uploads: SignedActivityProofUpload[];
  participationId: number;
  forProfileId: number;
  onSuccess: () => void;
};

export default function TryAgainForm({
  uploads,
  participationId,
  forProfileId,
  onSuccess,
}: TryAgainFormProps) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const { message, success } = await addFestivalActivityParticipantProof(
      participationId,
      uploads,
      forProfileId,
    );

    if (success) {
      toast.success(message);
      onSuccess();
    } else {
      toast.error(message);
    }
  });

  const disabled =
    form.formState.isSubmitting || form.formState.isSubmitSuccessful;

  return (
    <Form {...form}>
      <form onSubmit={action}>
        <SubmitButton
          disabled={disabled}
          loading={
            form.formState.isSubmitting || form.formState.isSubmitSuccessful
          }
        >
          Intenta nuevamente
          <CloudUploadIcon className="ml-2 w-4 h-4" />
        </SubmitButton>
      </form>
    </Form>
  );
}
