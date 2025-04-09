"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/app/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { VisitorBase, createVisitor } from "@/app/data/visitors/actions";
import { genderOptions } from "@/app/lib/utils";
import { genderEnum } from "@/db/schema";
import { formatDate } from "@/app/lib/formatters";
import PhoneInput from "@/app/components/form/fields/phone";
import TextInput from "@/app/components/form/fields/text";
import SelectInput from "@/app/components/form/fields/select";
import { DateTime } from "luxon";

const FormSchema = z.object({
  birthdate: z.coerce
    .date({
      required_error: "La fecha de nacimiento es requerida",
      invalid_type_error: "La fecha de nacimiento no es valida",
    })
    .refine((date) => date < new Date(), {
      message: "La fecha de nacimiento no puede ser en el futuro",
    })
    .refine(
      (date) => {
        const ageLimit = formatDate(new Date()).minus({ years: 10 });
        return formatDate(date).startOf("day") < ageLimit.startOf("day");
      },
      { message: "Debes tener al menos 10 años para registrarte" },
    ),
  email: z
    .string({
      required_error: "El correo electronico es requerido",
    })
    .email({
      message: "El correo electronico no es valido",
    }),
  firstName: z
    .string()
    .min(2, { message: "El nombre tiene que tener al menos dos letras" }),
  gender: z.enum([...genderEnum.enumValues]),
  lastName: z
    .string()
    .min(2, { message: "El apellido tiene que tener al menos dos letras" }),
  phoneNumber: z
    .string()
    .min(8, { message: "El número de teléfono no es valido" })
    .max(8, { message: "El número de teléfono no es valido" }),
});

export default function VisitorRegistrationForm({
  email,
  visitor,
}: {
  email: string;
  visitor: VisitorBase | undefined | null;
}) {
  const router = useRouter();
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      birthdate: visitor?.birthdate,
      email: email,
      firstName: visitor?.firstName || "",
      gender: visitor?.gender || "other",
      lastName: visitor?.lastName || "",
      phoneNumber: visitor?.phoneNumber || "",
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    const res = await createVisitor({
      ...data,
      birthdate: DateTime.fromJSDate(data.birthdate)
        .plus({ hours: 12 })
        .toJSDate(),
    });

    if (res.success) {
      router.push(`?${new URLSearchParams({ email: data.email, step: "3" })}`);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid items-start gap-2"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input disabled type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <TextInput
            formControl={form.control}
            name="firstName"
            label="Nombre"
            type="text"
          />
          <TextInput
            formControl={form.control}
            name="lastName"
            label="Apellido"
            type="text"
          />
        </div>
        <TextInput
          formControl={form.control}
          name="birthdate"
          label="Fecha de nacimiento"
          type="date"
        />
        <div className="grid grid-cols-2 gap-2 items-start">
          <PhoneInput
            formControl={form.control}
            name="phoneNumber"
            label="Teléfono"
          />
          <SelectInput
            formControl={form.control}
            label="Género"
            name="gender"
            options={genderOptions}
            side="top"
          />
        </div>
        <Button
          className="my-2"
          disabled={form.formState.isSubmitting}
          type="submit"
        >
          Siguiente <ArrowRightCircleIcon className="ml-2 h-4 w-4" />
        </Button>
      </form>
    </Form>
  );
}
