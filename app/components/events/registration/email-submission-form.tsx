"use client";

import { useForm } from "react-hook-form";

import { redirect, useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Loader2Icon, SendHorizonalIcon } from "lucide-react";

import {
  VisitorWithTickets,
  fetchVisitorByEmail,
} from "@/app/data/visitors/actions";
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

const FormSchema = z.object({
  email: z
    .string({
      required_error: "El correo electronico es requerido",
    })
    .email({
      message: "El correo electronico no es valido",
    }),
});

export default function EmailSubmissionForm() {
  const router = useRouter();
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const visitor = await fetchVisitorByEmail(data.email);
    if (visitor) {
      router.push(
        `?${new URLSearchParams({ email: data.email, step: "3", visitorId: visitor.id.toString() })}`,
      );
    } else {
      router.push(`?${new URLSearchParams({ email: data.email, step: "2" })}`);
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={action}>
        <div className="flex items-end gap-2">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="w-[250px] sm:w-[300px] md:w-[500px]">
                <FormLabel className="text-base sm:text-lg md:text-xl">
                  ¿Cuál es tu correo electrónico?
                </FormLabel>
                <FormMessage />
                <FormControl>
                  <Input
                    type="email"
                    placeholder="ejemplo@mail.com"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <Button disabled={form.formState.isSubmitting} size="icon">
            {form.formState.isSubmitting ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizonalIcon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
