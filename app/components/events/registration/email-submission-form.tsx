"use client";

import { captureClientEvent } from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { useForm } from "react-hook-form";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { SendHorizonalIcon } from "lucide-react";

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
import { startVisitorRegistration } from "@/app/lib/visitors/registration-actions";

const FormSchema = z.object({
  email: z.email({
    error: "El correo electronico no es valido",
  }),
});

export default function EmailSubmissionForm({
  festivalId,
}: {
  festivalId: number;
}) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    const result = await startVisitorRegistration({
      festivalId,
      email: data.email,
      mode: "online",
    });
    if (!result.success) {
      form.setError("email", { message: result.message });
      return;
    }

    captureClientEvent(POSTHOG_EVENTS.VISITOR_EMAIL_SUBMITTED, {
      is_returning_visitor: result.status === "returning",
    });
    // Who the visitor is now lives in a signed cookie, not in the URL.
    router.push(`?step=${result.status === "returning" ? "3" : "2"}`);
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
                    autoComplete="email"
                    placeholder="ejemplo@mail.com"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <SubmitButton
            className=" mt-4"
            disabled={
              form.formState.isSubmitting || form.formState.isSubmitSuccessful
            }
            label="Continuar"
            loading={
              form.formState.isSubmitting || form.formState.isSubmitSuccessful
            }
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
