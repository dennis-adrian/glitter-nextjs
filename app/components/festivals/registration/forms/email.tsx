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
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z.object({
  email: z
    .string({
      required_error: "El correo electronico es requerido",
    })
    .email({
      message: "El correo electronico no es valido",
    }),
});

type EmailFormProps = {
  setVisitor?: (visitor: VisitorWithTickets) => void;
  onSubmit: () => void;
};

export default function EmailForm(props: EmailFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const visitor = await fetchVisitorByEmail(data.email);
    const currentParams = new URLSearchParams(searchParams.toString());
    currentParams.set("email", data.email);

    if (visitor) {
      currentParams.set("visitorId", visitor.id.toString());
      currentParams.set("enableTicketCreation", "true");
    }

    props.onSubmit();
    router.push(`?${currentParams.toString()}`);
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
