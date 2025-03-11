"use client";

import * as htmlToImage from "html-to-image";
import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/app/components/ui/button";
import { DownloadIcon, UploadIcon } from "lucide-react";
import UploadPaymentVoucherModal from "@/app/components/payments/upload-payment-voucher-modal";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/defiinitions";

export default function QrCodeDownload({
  invoice,
}: {
  invoice: InvoiceWithPaymentsAndStand;
}) {
  const [downloading, setDownloading] = useState(false);
  const [uploadPaymentVoucher, setUploadPaymentVoucher] = useState(false);
  const qrCodeRef = useRef(null);
  const qrCodeSrc = invoice.reservation.stand.qrCode?.qrCodeUrl ?? "";

  if (!qrCodeSrc)
    return (
      <div className="text-muted-foreground">
        <span>No se encontró un código QR para el pago</span>
      </div>
    );

  const downloadQRCode = async () => {
    setDownloading(true);
    const dataUrl = await htmlToImage.toPng(qrCodeRef.current!);

    const link = document.createElement("a");
    link.download = "pago-de-espacio.png";
    link.href = dataUrl;
    link.click();
    setDownloading(false);
  };
  return (
    <div className="my-4">
      <h2 className="font-semibold text-lg text-center">Código QR</h2>
      <Image
        ref={qrCodeRef}
        className="mx-auto"
        alt="Código QR"
        src={qrCodeSrc}
        width={322}
        height={488}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          className="order-first md:order-last w-full md:max-w-fit"
          onClick={() => setUploadPaymentVoucher(true)}
        >
          Subir comprobante
          <UploadIcon className="ml-2 w-4 h-4" />
        </Button>
        <Button
          disabled={downloading}
          className="w-full md:max-w-fit"
          variant="outline"
          onClick={downloadQRCode}
        >
          {downloading ? (
            <>Descargando...</>
          ) : (
            <>
              Descargar código QR
              <DownloadIcon className="ml-2 w-4 h-4" />
            </>
          )}
        </Button>
      </div>
      <UploadPaymentVoucherModal
        invoice={invoice}
        open={uploadPaymentVoucher}
        onOpenChange={setUploadPaymentVoucher}
      />
    </div>
  );
}
