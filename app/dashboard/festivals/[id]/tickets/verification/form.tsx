"use client";

import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { verifyTicket } from "@/app/data/tickets/actions";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
  ticketCode: z.string().trim().min(1, {
    message: "El código de entrada es requerido",
  }),
});

export default function VerifyTicketForm({
  festivalId,
}: {
  festivalId: number;
}) {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      ticketCode: "",
    },
  });

  useEffect(() => {
    form.setFocus("ticketCode");
  }, [form, form.setFocus]);

  const action: () => void = form.handleSubmit(async (data) => {
    const { ticketCode } = data;
    const ticketNumber = Number(ticketCode.split(/[-\/]/)[1]); // Splits by either '-' or '/'
    if (Number.isNaN(ticketNumber)) {
      toast.error("Código de entrada inválido", {
        position: "top-right",
      });
      return;
    }

    const res = await verifyTicket(ticketNumber, festivalId);
    if (res.success) {
      toast.success(res.message, {
        position: "top-right",
      });
    } else {
      toast.error(res.message, {
        position: "top-right",
      });
    }

    form.setValue("ticketCode", "");
    form.setFocus("ticketCode");
  });

  return (
    <Form {...form}>
      <form className="grid gap-2" onSubmit={action}>
        <TextInput
          formControl={form.control}
          name="ticketCode"
          description="Puedes ingresar el código manualmente. Los dígitos después del guión (-) o barra (/)"
          label="Código de entrada"
          placeholder="Ingresa el código de la entrada"
        />
        <SubmitButton
          loading={form.formState.isSubmitting}
          disabled={form.formState.isSubmitting}
          label="Verificar"
        />
      </form>
    </Form>
  );
}
