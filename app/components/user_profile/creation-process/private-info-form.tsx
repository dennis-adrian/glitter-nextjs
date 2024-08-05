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
import { ArrowLeftIcon, SendIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
  birthdate: z.coerce
    .date()
    .refine((date) => date < new Date(), {
      message: "La fecha de nacimiento no puede ser en el futuro",
    })
    .refine(
      (date) => {
        const ageLimit = formatDate(new Date()).minus({ years: 16 });
        return formatDate(date).startOf("day") < ageLimit.startOf("day");
      },
      {
        message:
          "Debes tener al menos 16 años para participar de nuestros eventos",
      },
    ),
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
  gender: z.enum([...genderEnum.enumValues], {
    required_error: "El género es requerido",
  }),
  state: z
    .string({
      required_error: "El departamento es requerido",
    })
    .trim()
    .min(3, { message: "El departamento es requerido" }),
});

type PrivateInfoFormProps = {
  profile: ProfileType;
  onBack: () => void;
};

export default function PrivateInfoForm(props: PrivateInfoFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      birthdate: props.profile.birthdate || new Date(),
      firstName: props.profile.firstName || "",
      lastName: props.profile.lastName || "",
      phoneNumber: props.profile.phoneNumber || "",
      gender: props.profile.gender,
      state: props.profile.state || "",
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
        className="w-full my-4 grid gap-4 items-start grid-cols-1 sm:grid-cols-2"
      >
        <TextInput
          bottomBorderOnly
          formControl={form.control}
          label="Nombre"
          name="firstName"
          placeholder="Ingresa tu nombre real"
        />
        <TextInput
          bottomBorderOnly
          formControl={form.control}
          label="Apellido"
          name="lastName"
          placeholder="Ingresa tu apellido"
        />
        <TextInput
          bottomBorderOnly
          formControl={form.control}
          label="Fecha de nacimiento"
          name="birthdate"
          placeholder="Ingresa tu fecha de nacimiento"
          type="date"
        />
        <PhoneInput
          bottomBorderOnly
          formControl={form.control}
          label="Teléfono"
          name="phoneNumber"
        />
        <SelectInput
          formControl={form.control}
          label="Género"
          name="gender"
          options={genderOptions}
          placeholder="Elige una opción"
          variant="quiet"
        />
        <SelectInput
          formControl={form.control}
          label="Departamento de residencia"
          name="state"
          options={stateOptions}
          placeholder="Elige una opción"
          variant="quiet"
        />
        <div className="flex gap-2 my-4 col-span-1 sm:col-span-2">
          <Button type="button" variant="outline" onClick={props.onBack}>
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <SubmitButton
            disabled={form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
          >
            Finalizar
            <SendIcon className="ml-2 w-4 h-4" />
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
