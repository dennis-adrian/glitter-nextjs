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

export default function PaymentProofUpload({
  invoice,
}: {
  invoice: InvoiceWithPaymentsAndStand;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File>();
  const { edgestore } = useEdgeStore();
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0);
  const payment = invoice.payments[invoice.payments.length - 1];

  let uploadOptions = {};
  if (payment?.voucherUrl && payment?.voucherUrl.includes("edgestore")) {
    uploadOptions = {
      replaceTargetUrl: payment.voucherUrl,
    };
  }

  async function handleImageUpload() {
    if (file) {
      const res = await edgestore.publicFiles.upload({
        file,
        options: uploadOptions,
        onProgressChange: (progress) => {
          setShowProgress(true);
          setProgress(progress);
        },
      });

      const paymentRes = await fetch("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          id: payment?.id,
          amount: invoice.reservation.stand.price,
          date: new Date(),
          invoiceId: invoice.id,
          voucherUrl: res.url,
        }),
      });
      const data = (await paymentRes.json()) as CreatePaymentResponseType;

      if (data.success) {
        toast.success(data.message);
        router.push("/my_profile");
      } else {
        toast.error(data.message);
      }

      setShowProgress(false);
    }
  }

  return (
    <div className="my-4">
      <h2 className="font-semibold text-lg text-center">Comprobante de pago</h2>
      <div className="flex flex-col items-center justify-center gap-6">
        {showProgress ? (
          <div className="flex items-center justify-center w-full">
            <Progress value={progress} className="w-[60%]" />
          </div>
        ) : (
          <div className="mt-4">
            <SingleImageDropzone
              canRemove={false}
              width={320}
              height={460}
              value={file || payment?.voucherUrl}
              dropzoneOptions={{
                maxSize: 1024 * 1024 * 5, // 5MB,
              }}
              onChange={(file) => {
                setFile(file);
              }}
            />
          </div>
        )}
        <Button
          disabled={!file || showProgress}
          className="max-w-80"
          type="submit"
          onClick={handleImageUpload}
        >
          {payment?.voucherUrl ? (
            <span>Reemplazar comprobante</span>
          ) : (
            <span>Subir comprobante</span>
          )}
        </Button>
      </div>
    </div>
  );
}
