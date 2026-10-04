"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheckIcon, SendHorizonalIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import SubmitButton from "@/app/components/simple-submit-button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { requestTicketHistoryLink } from "@/app/lib/visitors/registration-actions";

const FormSchema = z.object({
  email: z.email({ error: "El correo electrónico no es válido" }),
});

/** Asks for the emailed link that opens a visitor's ticket history. */
export default function TicketHistoryLinkForm() {
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: { email: "" },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const res = await requestTicketHistoryLink({ email: data.email });
    if (res.success) {
      setSentMessage(res.message);
    } else {
      form.setError("email", { message: res.message });
    }
  });

  if (sentMessage) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-md border bg-muted/50 p-4 text-sm"
      >
        <MailCheckIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p>{sentMessage}</p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={action} className="grid gap-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Correo electrónico</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="ejemplo@mail.com"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <SubmitButton
          disabled={form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
        >
          <span className="flex items-center gap-2">
            Enviarme el enlace
            <SendHorizonalIcon className="h-4 w-4" aria-hidden />
          </span>
        </SubmitButton>
      </form>
    </Form>
  );
}
