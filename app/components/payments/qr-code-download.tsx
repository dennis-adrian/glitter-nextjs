"use client";

import * as htmlToImage from "html-to-image";
import { InvoiceBase } from "@/app/data/invoices/defiinitions";
import { useRef } from "react";
import { ProfileType, UserCategory } from "@/app/api/users/definitions";
import { imagesSrc } from "@/app/lib/maps/config";
import Image from "next/image";
import { Button } from "@/app/components/ui/button";

export default function QrCodeDownload({ profile }: { profile: ProfileType }) {
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
      <Image
        ref={qrCodeRef}
        className="mx-auto"
        alt="Código QR"
        src={qrCodeSrc!}
        width={322}
        height={488}
      />
      <div className="flex items-center justify-center gap-4 max-w-80 mx-auto mt-4">
        <Button variant="outline" onClick={downloadQRCode}>
          Descargar código QR
        </Button>
      </div>
    </div>
  );
}
