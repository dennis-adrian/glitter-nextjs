import { unpauseParticipantAccount } from "@/app/lib/participants/actions";
import { BaseProfile } from "@/app/api/users/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type UnpauseParticipantFormProps = {
  profile: BaseProfile;
  onSuccess: () => void;
};

export default function UnpauseParticipantForm({
  profile,
  onSuccess,
}: UnpauseParticipantFormProps) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const res = await unpauseParticipantAccount(profile.id);
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
          disabled={form.formState.isSubmitting}
          label="Reactivar cuenta"
          loading={form.formState.isSubmitting}
        />
      </form>
    </Form>
  );
}
