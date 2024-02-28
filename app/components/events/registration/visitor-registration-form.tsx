"use client";

import { useForm } from "react-hook-form";

import { z } from "zod";

import { FestivalBase } from "@/app/api/festivals/definitions";
import {
  VisitorBase,
  VisitorWithTickets,
  createVisitor,
} from "@/app/data/visitors/actions";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
import { Button } from "@/app/components/ui/button";
import { formatFullDate } from "@/app/lib/formatters";
import { createTicketsForVisitor } from "@/app/data/tickets/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const FormSchema = z.object({
  attendance: z.enum(["day_one", "day_two", "both"]),
  birthdate: z.string().min(1, {
    message: "La fecha de nacimiento es requerida",
  }),
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

export default function VisitorRegistrationForm({
  email,
  festival,
  visitor,
}: {
  email: string;
  festival: FestivalBase;
  visitor: VisitorBase | undefined | null;
}) {
  const router = useRouter();
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      attendance: "both",
      birthdate: formatDateOnlyToISO(visitor?.birthdate),
      email: email,
      eventDiscovery: visitor?.eventDiscovery || "instagram",
      firstName: visitor?.firstName || "",
      gender: visitor?.gender || "other",
      lastName: visitor?.lastName || "",
      phoneNumber: visitor?.phoneNumber || "",
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    const res = await createVisitor({
      ...data,
      birthdate: new Date(data.birthdate),
    });

    if (res.success) {
      router.push(
        `?${new URLSearchParams({ email: data.email, step: "3" })}`,
      );
    } else {
      toast.error(res.error);
    }

    // if (res.success) {
    //   onSuccess(res);
    // } else {
    //   toast.error(res.error)
    // }
    // const res = await createTicketsForVisitor({
    //   ...data,
    //   birthdate: new Date(data.birthdate),
    //   festival: festival,
    //   visitorId: visitor?.id,
    // });
    // if (res) {
    //   onSuccess(res);
    // }
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
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input type="text" {...field} />
                </FormControl>
                <FormMessage />
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
                <FormMessage />
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
                    <span className="absolute left-2 rounded-sm bg-gray-200 p-1 text-sm">
                      +591
                    </span>
                    <Input className="pl-14" type="tel" {...field} />
                  </div>
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
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
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
        <FormField
          control={form.control}
          name="attendance"
          render={({ field }) => (
            <FormItem>
              <FormLabel>¿Qué día asistirás?</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Elige una opción" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="day_one">
                    El primer día - {formatFullDate(festival.startDate)}
                  </SelectItem>
                  <SelectItem value="day_two">
                    El segundo día - {formatFullDate(festival.endDate)}
                  </SelectItem>
                  <SelectItem value="both">Ambos días</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <Button type="submit">Registrarse</Button>
      </form>
    </Form>
  );
}
