import { pauseParticipantAccount } from "@/app/lib/participants/actions";
import { ParticipantProfile } from "@/app/lib/participants/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type PauseParticipantFormProps = {
  profile: ParticipantProfile;
  onSuccess: () => void;
};

export default function PauseParticipantForm({
  profile,
  onSuccess,
}: PauseParticipantFormProps) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const res = await pauseParticipantAccount(profile.id);
    if (res.success) {
      toast.success(res.message);
      onSuccess();
      return;
    }

    toast.error(res.message, {
      description: res.description,
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={action} className="w-full">
        <SubmitButton
          disabled={
            form.formState.isSubmitting ||
            !profile.activitySummary.isPauseEligible
          }
          label="Pausar cuenta"
          loading={form.formState.isSubmitting}
        />
      </form>
    </Form>
  );
}
