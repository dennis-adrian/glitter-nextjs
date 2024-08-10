"use client";

import { useState } from "react";

import { useEdgeStore } from "@/app/lib/edgestore";

import { SingleImageDropzone } from "@/components/single-image-dropzone";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/defiinitions";
import { CreatePaymentResponseType } from "@/app/api/payments/route";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { UploadButton, UploadDropzone } from "@/app/vendors/uploadthing";
import Image from "next/image";

const handlePaymentCreation = async (
  invoice: InvoiceWithPaymentsAndStand,
  voucherUrl: string,
) => {
  const res = await fetch("/api/payments", {
    method: "POST",
    body: JSON.stringify({
      id: invoice.id,
      amount: invoice.amount,
      date: new Date(),
      invoiceId: invoice.id,
      voucherUrl,
    }),
  });

  return (await res.json()) as CreatePaymentResponseType;
};
export default function PaymentProofUpload({
  invoice,
}: {
  invoice: InvoiceWithPaymentsAndStand;
}) {
  const router = useRouter();
  const [voucherImageUrl, setVoucherImageUrl] = useState<string>(
    invoice.payments[0]?.voucherUrl,
  );

  return (
    <div className="flex flex-col gap-4">
      {voucherImageUrl ? (
        <Image
          src={voucherImageUrl}
          alt="comprobante de pago"
          width={300}
          height={400}
        />
      ) : (
        <div className="h-[300px] w-[300px] border border-dashed mx-auto flex justify-center items-center">
          <p className="text-xs text-muted-foreground text-center">
            Haz clic en el botón para subir el comprobante
          </p>
        </div>
      )}
      <UploadButton
        endpoint="reservationPayment"
        onClientUploadComplete={async (res) => {
          const { results } = res[0].serverData;
          if (!results.imageUrl) {
            toast.error("Error al subir el comprobante");
            return;
          }

          setVoucherImageUrl(results.imageUrl);
          const response = await handlePaymentCreation(
            invoice,
            results.imageUrl,
          );

          if (response.success) {
            toast.success(response.message);
            router.push("/my_profile");
          } else {
            toast.error(response.message);
          }
        }}
      />
    </div>
  );
}
