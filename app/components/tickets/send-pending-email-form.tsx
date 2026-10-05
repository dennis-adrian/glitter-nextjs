"use client";

import { useForm } from "react-hook-form";
import { Loader2Icon, SendIcon } from "lucide-react";

import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { resendTicketEmail } from "@/app/lib/tickets/resend-actions";
import { toast } from "sonner";

type SendEmailFormProps = {
  ticketId: number;
  /** Why this viewer cannot resend; shown under the disabled button. */
  disabledReason?: string;
};

const FAILURE_MESSAGE =
  "No pudimos reenviar la entrada. Intentá de nuevo en unos minutos.";

export default function SendEmailForm(props: SendEmailFormProps) {
  const form = useForm();
  const { disabledReason } = props;

  const action: () => void = form.handleSubmit(async () => {
    let res;
    try {
      res = await resendTicketEmail(props.ticketId);
    } catch (error) {
      console.error("Error resending ticket email", error);
      toast.error(FAILURE_MESSAGE);
      return;
    }

    if (res.success) {
      toast.success("Entrada reenviada", {
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
          disabled={disabledReason != null || form.formState.isSubmitting}
          title={disabledReason}
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
              Reenviar entrada por correo
            </>
          )}
        </Button>
        {disabledReason && (
          <p className="mt-2 text-xs text-muted-foreground">{disabledReason}</p>
        )}
      </form>
    </Form>
  );
}
