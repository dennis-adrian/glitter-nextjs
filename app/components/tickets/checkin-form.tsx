"use client";

import { useForm } from "react-hook-form";
import { CheckIcon, Loader2Icon } from "lucide-react";

import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { updateTicket } from "@/app/data/tickets/actions";
import { toast } from "sonner";

export default function CheckInForm({
  id,
  disabledReason,
}: {
  id: number;
  /** Why this viewer cannot check in; shown under the disabled button. */
  disabledReason?: string;
}) {
  const form = useForm();

  async function onSubmit() {
    const res = await updateTicket(id, "checked_in");
    if (res.success) {
      toast.success("Asistencia confirmada");
    } else if (res.error) {
      toast.error(res.error);
    } else {
      toast.error("Ocurrió un error inesperado");
    }
  }

  return (
    <Form {...form}>
      <form className="w-full" onSubmit={form.handleSubmit(onSubmit)}>
        <Button
          className="w-full"
          disabled={disabledReason != null || form.formState.isSubmitting}
          title={disabledReason}
          type="submit"
        >
          {form.formState.isSubmitting ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Cargando...
            </>
          ) : (
            <>
              <CheckIcon className="mr-2 h-4 w-4" />
              Confirmar asistencia
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
