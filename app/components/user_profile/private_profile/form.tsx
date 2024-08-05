"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  formatDateOnlyToISO,
  genderOptions,
  stateOptions,
} from "@/app/lib/utils";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { ProfileType } from "@/app/api/users/definitions";
import { updateProfileWithValidatedData } from "@/app/api/users/actions";
import { phoneRegex } from "@/app/lib/users/utils";
import { genderEnum } from "@/db/schema";
import SelectInput from "@/app/components/form/fields/select";
import SubmitButton from "@/app/components/simple-submit-button";
import TextInput from "@/app/components/form/fields/text";
import { formatDate } from "@/app/lib/formatters";
import { toast } from "sonner";
import { updateProfile } from "@/app/lib/users/actions";

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
    .regex(phoneRegex, "Número de teléfono inválido. Necesita tener 8 dígitos"),
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

export default function PrivateProfileForm({
  profile,
  onSuccess,
}: {
  profile: ProfileType;
  onSuccess: () => void;
}) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      birthdate: profile.birthdate || new Date(),
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      phoneNumber: profile.phoneNumber || "",
      gender: profile.gender,
      state: profile.state || "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const result = await updateProfile(profile.id, {
      ...data,
    });

    if (result.success) {
      toast.success(result.message);
      onSuccess();
    } else {
      toast.error(result.message);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={action} className="grid items-start gap-4 mt-4">
        <FormField
          control={form.control}
          name="firstName"
          render={({ field }) => (
            <FormItem className="grid gap-2">
              <FormLabel>Nombre</FormLabel>
              <FormControl>
                <Input type="text" placeholder="Ingresa tu nombre" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="lastName"
          render={({ field }) => (
            <FormItem className="grid gap-2">
              <FormLabel>Apellido</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="Ingresa tu apellido"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <TextInput
          formControl={form.control}
          label="Fecha de nacimiento"
          name="birthdate"
          placeholder="Ingresa tu fecha de nacimiento"
          type="date"
        />
        <FormField
          control={form.control}
          name="phoneNumber"
          render={({ field }) => (
            <FormItem className="grid gap-2">
              <FormLabel>Número de teléfono</FormLabel>
              <FormControl>
                <div className="relative flex items-center">
                  <span className="absolute left-2 text-muted-foreground">
                    +591
                  </span>
                  <Input
                    className="pl-14"
                    type="tel"
                    placeholder="7XXXXXXX"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <SelectInput
          formControl={form.control}
          label="Género"
          name="gender"
          options={genderOptions}
          placeholder="Elige una opción"
        />
        <SelectInput
          formControl={form.control}
          label="Departamento de residencia"
          name="state"
          options={stateOptions}
          placeholder="Elige una opción"
        />
        <SubmitButton
          disabled={form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
        >
          Guardar cambios
        </SubmitButton>
      </form>
    </Form>
  );
}
