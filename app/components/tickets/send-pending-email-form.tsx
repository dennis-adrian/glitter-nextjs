"use client";

import { useForm } from "react-hook-form";
import { CheckIcon, Loader2Icon, SendIcon } from "lucide-react";

import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { sendTicketEmail } from "@/app/data/tickets/actions";
import { toast } from "sonner";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { FestivalBase } from "@/app/lib/festivals/definitions";

type SendEmailFormProps = {
  visitor: VisitorWithTickets;
  festival: FestivalBase;
};

export default function SendEmailForm(props: SendEmailFormProps) {
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    const res = await sendTicketEmail(props.visitor, props.festival);
    if (res.success) {
      toast.success("Entrada enviado", {
        description: res.message,
      });
    } else {
      toast.error(res.message);
    }
  });

  return (
    <Form {...form}>
      <form className="w-full" onSubmit={action}>
        <Button
          className="w-full"
          disabled={form.formState.isSubmitting}
          type="submit"
          variant="outline"
        >
          {form.formState.isSubmitting ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <SendIcon className="mr-2 h-4 w-4" />
              Enviar entrada por correo
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
