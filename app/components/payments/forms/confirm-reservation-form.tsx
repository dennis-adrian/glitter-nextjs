"use client";

import { adminConfirmReservationAction } from "@/app/lib/reservations/payment-actions";
import { InvoiceWithParticipants } from "@/app/data/invoices/definitions";
import { useForm } from "react-hook-form";
import { Form } from "@/app/components/ui/form";
import { toast } from "sonner";
import SubmitButton from "@/app/components/simple-submit-button";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ConfirmReservationFormProps = {
  invoice: InvoiceWithParticipants;
  onSuccess: () => void;
  markAsPaid?: boolean;
};
export function ConfirmReservationForm(props: ConfirmReservationFormProps) {
  const form = useForm();
  const router = useRouter();
  const [confirmIntentKey] = useState(() => crypto.randomUUID());

  const action = form.handleSubmit(async () => {
    const voucherUrl = props.invoice.payments.find(
      (payment) => payment.voucherUrl,
    )?.voucherUrl;
    const result = await adminConfirmReservationAction({
      invoiceId: props.invoice.id,
      markAsPaid: props.markAsPaid,
      idempotencyKey: confirmIntentKey,
      voucherUrl,
    });
    if (result.success) {
      toast.success("Reserva confirmada");
      props.onSuccess();
      form.reset();
      router.refresh();
    } else {
      toast.error(result.message);
    }
  });

  return (
    <Form {...form}>
      <form className="w-full" onSubmit={action}>
        <SubmitButton
          disabled={form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
          label="Confirmar reserva"
        />
      </form>
    </Form>
  );
}
