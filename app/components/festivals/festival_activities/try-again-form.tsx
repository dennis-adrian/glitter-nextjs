import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { addFestivalActivityParticipantProof } from "@/app/lib/festival_sectors/actions";
import { CloudUploadIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type TryAgainFormProps = {
  imageUrls: string[];
  participationId: number;
  onSuccess: () => void;
};

export default function TryAgainForm({
  imageUrls,
  participationId,
  onSuccess,
}: TryAgainFormProps) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const { message, success } = await addFestivalActivityParticipantProof(
      participationId,
      imageUrls,
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
