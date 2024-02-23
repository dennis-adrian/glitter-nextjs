"use client";

import { useForm } from "react-hook-form";

import { z } from "zod";

import { FestivalBase } from "@/app/api/festivals/definitions";
import { VisitorBase } from "@/app/api/visitors/actions";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { eventDiscoveryEnum, genderEnum } from "@/db/schema";
import {
  eventDiscoveryOptions,
  formatDateOnlyToISO,
  genderOptions,
} from "@/app/lib/utils";

const FormSchema = z.object({
  birthdate: z.string(),
  email: z
    .string({
      required_error: "El correo electronico es requerido",
    })
    .email({
      message: "El correo electronico no es valido",
    }),
  eventDiscovery: z.enum([...eventDiscoveryEnum.enumValues]),
  firstName: z
    .string()
    .min(2, { message: "El nombre tiene que tener al menos dos letras" }),
  gender: z.enum([...genderEnum.enumValues]),
  lastName: z
    .string()
    .min(2, { message: "El apellido tiene que tener al menos dos letras" }),
  phoneNumber: z
    .string()
    .min(8, { message: "El número de teléfono no es valido" }),
});

export default function EventRegistrationForm({
  email,
  festival,
  visitor,
}: {
  email: string;
  festival: FestivalBase;
  visitor: VisitorBase | undefined | null;
}) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      birthdate: formatDateOnlyToISO(visitor?.birthdate),
      email: email,
      eventDiscovery: visitor?.eventDiscovery || "instagram",
      firstName: visitor?.firstName || "",
      gender: visitor?.gender || "other",
      lastName: visitor?.lastName || "",
      phoneNumber: visitor?.phoneNumber || "",
    },
  });

  return (
    <Form {...form}>
      <form className="grid items-start gap-4">
        <FormField
          disabled
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input type="text" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Apellido</FormLabel>
                <FormControl>
                  <Input type="text" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FormField
            control={form.control}
            name="phoneNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Teléfono</FormLabel>
                <FormControl>
                  <div className="relative flex items-center">
                    <span className="absolute left-2 bg-gray-200 text-sm rounded-sm p-1">
                      +591
                    </span>
                    <Input className="pl-14" type="tel" {...field} />
                  </div>
                </FormControl>
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
                  <Input type="date" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="gender"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Género</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Elige una opción" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {genderOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="eventDiscovery"
          render={({ field }) => (
            <FormItem>
              <FormLabel>¿Cómo te enteraste del evento?</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Elige una opción" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {eventDiscoveryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
