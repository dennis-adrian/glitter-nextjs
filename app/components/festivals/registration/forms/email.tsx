"use client";

import SubmitButton from "@/app/components/simple-submit-button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import {
  fetchVisitorByEmail,
  VisitorWithTickets,
} from "@/app/data/visitors/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z.object({
  email: z.email({
            error: "El correo electronico no es valido"
        }),
});

type EmailFormProps = {
  onSubmit: (email: string, visitor?: VisitorWithTickets | null) => void;
};

export default function EmailForm(props: EmailFormProps) {
  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const visitor = await fetchVisitorByEmail(data.email);
    props.onSubmit(data.email, visitor);
  });

  return (
    <Form {...form}>
      <form className="w-full p-3 flex flex-col items-center" onSubmit={action}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="w-full">
              <FormMessage />
              <FormControl>
                <Input
                  bottomBorderOnly
                  type="email"
                  placeholder="ejemplo@mail.com"
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <SubmitButton
          className="mt-4 md:max-w-80"
          disabled={form.formState.isSubmitting}
          label="Continuar"
          loading={form.formState.isSubmitting}
        >
          <span>Continuar</span>
          <ArrowRightIcon className="ml-2 w-4 h-4" />
        </SubmitButton>
      </form>
    </Form>
  );
}
