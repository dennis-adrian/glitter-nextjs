"use client";

import { useState } from "react";

import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/defiinitions";
import { CreatePaymentResponseType } from "@/app/api/payments/route";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { UploadButton } from "@/app/vendors/uploadthing";
import Image from "next/image";
import { Loader2Icon } from "lucide-react";

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

  const data = await res.json();
  return data as CreatePaymentResponseType;
};
export default function PaymentProofUpload({
  invoice,
}: {
  invoice: InvoiceWithPaymentsAndStand;
}) {
  const router = useRouter();
  const [voucherImageUrl, setVoucherImageUrl] = useState<string | null>(
    invoice.payments[0]?.voucherUrl,
  );

  return (
    <div className="flex flex-col gap-4">
      {voucherImageUrl ? (
        <Image
          className="mx-auto"
          src={voucherImageUrl}
          alt="comprobante de pago"
          width={300}
          height={400}
        />
      ) : (
        <div className="h-[200px] w-[200px] border border-dashed mx-auto flex justify-center items-center">
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
        content={{
          button({ ready, isUploading, uploadProgress }) {
            if (isUploading && uploadProgress === 100) {
              return (
                <Loader2Icon className="w-4 h-4 text-white animate-spin" />
              );
            }
            if (isUploading) return <div>{uploadProgress}%</div>;
            if (ready) return <div>Elige una imagen</div>;
            return "Cargando...";
          },
          allowedContent({ ready, isUploading }) {
            if (!ready) return null;
            if (isUploading) return "Subiendo imagen...";
            return "Imagen hasta 4MB";
          },
        }}
        appearance={{
          button: ({ ready, isUploading }) => {
            if (!ready) {
              return "bg-primary text-xs";
            }
            if (isUploading) {
              return "bg-primary text-xs after:bg-primary-400/60 after:text-white";
            }
            return "bg-primary text-xs hover:bg-primary-400";
          },
        }}
      />
    </div>
  );
}
