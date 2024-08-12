import { ProfileType } from "@/app/api/users/definitions";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { updateProfile } from "@/app/lib/users/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, { message: "El nombre tiene que tener al menos dos letras" }),
  bio: z
    .string()
    .trim()
    .min(10, { message: "La bio tiene que tener al menos 10 letras" })
    .max(80, { message: "La bio no puede tener mas de 80 letras" }),
});

type DisplayNameFormProps = {
  profile: ProfileType;
  onSubmit: () => void;
};

export default function DisplayNameForm(props: DisplayNameFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      displayName: props.profile.displayName || "",
      bio: props.profile.bio || "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const res = await updateProfile(props.profile.id, {
      displayName: data.displayName,
      bio: data.bio,
    });

    if (res.success) {
      toast.success(res.message);
      props.onSubmit();
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form className="w-full flex flex-col gap-4 my-4" onSubmit={action}>
        <TextInput
          bottomBorderOnly
          formControl={form.control}
          label="Nombre de tu perfil"
          name="displayName"
          placeholder="Nombre con el que te reconocen"
        />
        <TextareaInput
          formControl={form.control}
          label="Bio"
          name="bio"
          placeholder="Escribe un poco sobre ti"
        />
        <div className="flex justify-end items-center gap-2">
          <SubmitButton
            disabled={form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
          >
            <span>Continuar</span>
            <ArrowRightIcon className="ml-2 w-4 h-4" />
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
