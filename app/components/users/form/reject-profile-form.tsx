import { rejectProfile } from "@/app/api/users/actions";
import { ProfileType } from "@/app/api/users/definitions";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

type RejectProfileFormProps = {
  profile: ProfileType;
  onSuccess: () => void;
};

const FormSchema = z.object({
  reason: z.string().min(10, {
      error: "La razón es requerida"
}),
});

export default function RejectProfileForm(props: RejectProfileFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const res = await rejectProfile(props.profile, data.reason);
    if (res.success) {
      toast.success(res.message);
      props.onSuccess();
    } else {
      toast.error(res.message);
    }
  });

  return (
		<Form {...form}>
			<form onSubmit={action} className="w-full text-left">
				<div className="flex flex-col gap-4">
					<TextareaInput
						formControl={form.control}
						label="Razón de rechazo"
						name="reason"
						placeholder="Ingresa una razón para rechazar el perfil"
						maxLength={1000}
					/>
					<SubmitButton
						disabled={form.formState.isSubmitting}
						label="Rechazar perfil"
						loading={form.formState.isSubmitting}
					/>
				</div>
			</form>
		</Form>
	);
}
