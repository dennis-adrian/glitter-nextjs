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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { VisitorBase, createVisitor } from "@/app/data/visitors/actions";
import { genderOptions } from "@/app/lib/utils";
import { genderEnum } from "@/db/schema";
import { formatDate } from "@/app/lib/formatters";

const FormSchema = z.object({
  birthdate: z.coerce
    .date()
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
    .min(8, { message: "El número de teléfono no es valido" }),
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
      birthdate: new Date(data.birthdate),
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
                <SelectContent position="item-aligned">
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
                  <Input
                    type="date"
                    {...field}
                    value={field.value?.toLocaleString()}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
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
