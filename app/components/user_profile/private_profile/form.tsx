"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { formatDateOnlyToISO } from "@/app/lib/utils";

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

const phoneRegex = new RegExp(/^\d{8}$/);
const FormSchema = z.object({
  birthdate: z.string().min(1, {
    message: "La fecha de nacimiento es requerida",
  }),
  firstName: z
    .string()
    .min(2, { message: "El nombre tiene que tener al menos dos letras" }),
  lastName: z
    .string()
    .min(2, { message: "El apellido tiene que tener al menos dos letras" }),
  phoneNumber: z
    .string()
    .regex(phoneRegex, "Número de teléfono inválido. Necesita tener 8 dígitos"),
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
      birthdate: formatDateOnlyToISO(profile?.birthdate) || "",
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      phoneNumber: profile.phoneNumber ? `+591 ${profile.phoneNumber}` : "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const result = await updateProfileWithValidatedData(profile.id, {
      ...profile,
      ...data,
      birthdate: new Date(data.birthdate),
    });
    if (result.success) onSuccess();
  });

  return (
    <Form {...form}>
      <form action={action} className="grid items-start gap-4 mt-4">
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
        <FormField
          control={form.control}
          name="birthdate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha de nacimiento</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  max={formatDateOnlyToISO(new Date())}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
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
        <Button type="submit">Guardar cambios</Button>
      </form>
    </Form>
  );
}
