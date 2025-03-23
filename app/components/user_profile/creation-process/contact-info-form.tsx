  import { ProfileType } from "@/app/api/users/definitions";
  import PhoneInput from "@/app/components/form/fields/phone";
  import SelectInput from "@/app/components/form/fields/select";
  import TextInput from "@/app/components/form/fields/text";
  import SubmitButton from "@/app/components/simple-submit-button";
  import { Button } from "@/app/components/ui/button";
  import { Form } from "@/app/components/ui/form";
  import { formatDate } from "@/app/lib/formatters";
  import { updateProfile } from "@/app/lib/users/actions";
  import { phoneRegex } from "@/app/lib/users/utils";
  import { genderOptions, stateOptions } from "@/app/lib/utils";
  import { genderEnum } from "@/db/schema";
  import { zodResolver } from "@hookform/resolvers/zod";
  import { ArrowDownToLineIcon, ArrowLeftIcon, SendIcon } from "lucide-react";
  import { useForm } from "react-hook-form";
  import { toast } from "sonner";
  import { z } from "zod";

  const FormSchema = z.object({
    firstName: z
      .string()
      .trim()
      .min(2, { message: "El nombre tiene que tener al menos dos letras" }),
    lastName: z
      .string()
      .trim()
      .min(2, { message: "El apellido tiene que tener al menos dos letras" }),
    phoneNumber: z
      .string()
      .trim()
      .regex(phoneRegex, "Número de teléfono inválido")
      .min(8, { message: "El número de teléfono necesita de 8 dígitos" }),
  });

  type ContactInfoFormProps = {
    profile: ProfileType;
  };

  export default function ContactInfoForm(props: ContactInfoFormProps) {
    const form = useForm<z.infer<typeof FormSchema>>({
      resolver: zodResolver(FormSchema),
      defaultValues: {
        firstName: props.profile.firstName || "",
        lastName: props.profile.lastName || "",
        phoneNumber: props.profile.phoneNumber || "",
      },
    });

    const action: () => void = form.handleSubmit(async (data) => {
      const res = await updateProfile(props.profile.id, {
        ...data,
      });
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    });

    return (
      <Form {...form}>
        <form
          onSubmit={action}
          className="w-full mt-4 md:mt-6 grid gap-4 items-start grid-cols-1 sm:grid-cols-2"
        >
          <TextInput
            bottomBorderOnly
            formControl={form.control}
            label="Nombre"
            name="firstName"
            placeholder="Ingresa tu nombre"
          />
          <TextInput
            bottomBorderOnly
            formControl={form.control}
            label="Apellido"
            name="lastName"
            placeholder="Ingresa tu apellido"
          />
          <PhoneInput
            bottomBorderOnly
            formControl={form.control}
            label="Teléfono"
            name="phoneNumber"
          />
          <div className="flex gap-2 my-2 col-span-1 sm:col-span-2">
            <SubmitButton
              disabled={form.formState.isSubmitting || form.formState.isSubmitSuccessful}
              loading={form.formState.isSubmitting}
              loadingLabel="Guardando"
            >
              Guardar
              <ArrowDownToLineIcon className="ml-2 w-4 h-4" />
            </SubmitButton>
          </div>
        </form>
      </Form>
    );
  }
