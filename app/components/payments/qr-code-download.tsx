"use client";

import * as htmlToImage from "html-to-image";
import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/app/components/ui/button";
import { DownloadIcon } from "lucide-react";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/defiinitions";

export default function QrCodeDownload({
  invoice,
}: {
  invoice: InvoiceWithPaymentsAndStand;
}) {
  const [downloading, setDownloading] = useState(false);
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
    <div className="my-4 flex flex-col items-center gap-2">
      <Image
        ref={qrCodeRef}
        className="mx-auto"
        alt="Código QR"
        src={qrCodeSrc}
        width={240}
        height={240}
      />
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
  );
}
