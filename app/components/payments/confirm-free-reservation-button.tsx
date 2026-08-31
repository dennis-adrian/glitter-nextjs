"use client";

import { captureClientEvent } from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { confirmFreeInvoice } from "@/app/data/invoices/actions";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";
import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type ConfirmFreeReservationButtonProps = {
  invoice: InvoiceWithPaymentsAndStand;
};

export default function ConfirmFreeReservationButton({
  invoice,
}: ConfirmFreeReservationButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isConfirming, setIsConfirming] = useState(false);
  const form = useForm();

  const action: () => void = form.handleSubmit(() => {
    setIsConfirming(true);
    startTransition(async () => {
      let res;
      try {
        res = await confirmFreeInvoice({
          invoiceId: invoice.id,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? ` ${error.message}` : "";
        toast.error(
          `No se pudo confirmar la reserva. Inténtalo de nuevo.${errorMessage}`,
        );
        console.error("Error confirming free reservation:", error);
        setIsConfirming(false);
        return;
      }

      try {
        if (res.success === true) {
          form.reset();
          captureClientEvent(POSTHOG_EVENTS.FREE_RESERVATION_CONFIRMED, {
            invoice_id: invoice.id,
            reservation_id: invoice.reservationId,
            stand_id: invoice.reservation.standId,
          });
          toast.success("Solicitud enviada. Tu reserva está en revisión.");
          router.push(
            `/profiles/${invoice.userId}/invoices/${invoice.id}/success`,
          );
        } else if (res.success === false) {
          toast.error(res.message);
        }
      } finally {
        setIsConfirming(false);
      }
    });
  });

  return (
    <Form {...form}>
      <form className="w-full mt-4" onSubmit={action}>
        <SubmitButton
          disabled={form.formState.isSubmitting || isConfirming || isPending}
          loading={form.formState.isSubmitting || isConfirming || isPending}
        >
            Solicitá revisión
          <CheckIcon className="h-4 w-4 ml-2" />
        </SubmitButton>
      </form>
    </Form>
  );
}
