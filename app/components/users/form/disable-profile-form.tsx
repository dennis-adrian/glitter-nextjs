import { disableProfile } from "@/app/api/users/actions";
import { BaseProfile } from "@/app/api/users/definitions";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type DisableProfileFormProps = {
  profile: BaseProfile;
  onSuccess: () => void;
};

export default function DisableProfileForm(props: DisableProfileFormProps) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const res = await disableProfile(props.profile.id);
    if (res.success) {
      toast.success(res.message);
      props.onSuccess();
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={action} className="w-full">
        <SubmitButton
          disabled={form.formState.isSubmitting}
          label="Deshabilitar cuenta"
          loading={form.formState.isSubmitting}
        />
      </form>
    </Form>
  );
}
