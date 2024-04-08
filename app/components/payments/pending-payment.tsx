"use client";

import * as htmlToImage from "html-to-image";
import { InvoiceBase } from "@/app/data/invoices/defiinitions";
import { useRef } from "react";
import { ProfileType, UserCategory } from "@/app/api/users/definitions";
import { imagesSrc } from "@/app/lib/maps/config";
import Image from "next/image";
import { Button } from "@/app/components/ui/button";

export default function PendingPayment({
  invoice,
  profile,
}: {
  invoice: InvoiceBase;
  profile: ProfileType;
}) {
  const qrCodeRef = useRef(null);
  const qrCodeSrc =
    imagesSrc["v3"][profile.category as Exclude<UserCategory, "none">].qrCode;

  const downloadQRCode = async () => {
    const dataUrl = await htmlToImage.toPng(qrCodeRef.current!);

    const link = document.createElement("a");
    link.download = "pago-de-espacio.png";
    link.href = dataUrl;
    link.click();
  };
  return (
    <div>
      <h1 className="font-bold text-2xl my-4">
        Tu reserva fue realizado con éxito
      </h1>
      <h3>Descarga el código QR para realizar tu pago</h3>
      <Image
        ref={qrCodeRef}
        className="mx-auto"
        alt="Código QR"
        src={qrCodeSrc!}
        width={322}
        height={488}
      />
      <div className="flex items-center justify-center gap-4 max-w-60 mx-auto mt-4">
        <Button className="" variant="outline" onClick={downloadQRCode}>
          Descargar código QR
        </Button>
      </div>
    </div>
  );
}
