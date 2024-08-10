"use client";

import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { createPayment } from "@/app/data/invoices/actions";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/defiinitions";
import { SendHorizonal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type UploadPaymentVoucherFormProps = {
  invoice: InvoiceWithPaymentsAndStand;
  newVoucherUrl?: string;
};
export default function UploadPaymentVoucherForm(
  props: UploadPaymentVoucherFormProps,
) {
  const router = useRouter();
  const form = useForm();

  const action: () => void = form.handleSubmit(async () => {
    if (!props.newVoucherUrl) {
      toast.error("Se necesita un comprobante para confirmar el pago");
    } else {
      const res = await createPayment(
        {
          id: props.invoice.id,
          amount: props.invoice.amount,
          date: new Date(),
          invoiceId: props.invoice.id,
          voucherUrl: props.newVoucherUrl,
        },
        props.invoice.payments[0]?.voucherUrl,
      );

      if (res.success) {
        toast.success("Pago enviado con éxito");
        router.push("/my_profile");
      } else {
        toast.error("Error al enviar el pago");
      }
    }
  });

  return (
    <Form {...form}>
      <form className="w-full max-w-80 mt-4 mx-auto" onSubmit={action}>
        <div className="flex flex-col gap-4">
          <SubmitButton
            disabled={form.formState.isSubmitting}
            loading={form.formState.isSubmitting}
          >
            Confirmar pago
            <SendHorizonal className="h-4 w-4 ml-2" />
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
