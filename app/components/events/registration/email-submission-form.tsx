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
import SubmitButton from "@/app/components/simple-submit-button";

const FormSchema = z.object({
  email: z.email({
            error: "El correo electronico no es valido"
        }),
});

export default function EmailSubmissionForm() {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const visitor = await fetchVisitorByEmail(data.email);
    if (visitor) {
      router.push(
        `?${new URLSearchParams({
          email: data.email,
          step: "3",
          visitorId: visitor.id.toString(),
        })}`,
      );
    } else {
      router.push(`?${new URLSearchParams({ email: data.email, step: "2" })}`);
    }
  });

  return (
    <Form {...form}>
      <form className="mt-4" onSubmit={action}>
        <div>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="w-full">
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
          <SubmitButton
            className=" mt-4"
            disabled={form.formState.isSubmitting}
            label="Continuar"
            loading={form.formState.isSubmitting}
          >
            <span className="flex items-center gap-2">
              Continuar
              <SendHorizonalIcon className="h-4 w-4" />
            </span>
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
