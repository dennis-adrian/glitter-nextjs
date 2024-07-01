"use client";

import * as htmlToImage from "html-to-image";
import { useRef } from "react";
import { ProfileType, UserCategory } from "@/app/api/users/definitions";
import Image from "next/image";
import { Button } from "@/app/components/ui/button";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { getPaymentQrCodeUrlByCategory } from "@/app/lib/payments/helpers";

export default function QrCodeDownload({
  festival,
  profile,
}: {
  festival: FestivalBase;
  profile: ProfileType;
}) {
  const qrCodeRef = useRef(null);
  const qrCodeSrc = getPaymentQrCodeUrlByCategory(
    festival,
    profile.category as Exclude<UserCategory, "none">,
  );

  if (!qrCodeSrc)
    return (
      <div className="text-muted-foreground">
        <span>No se encontró un código QR para el pago</span>
      </div>
    );

  const downloadQRCode = async () => {
    const dataUrl = await htmlToImage.toPng(qrCodeRef.current!);

    const link = document.createElement("a");
    link.download = "pago-de-espacio.png";
    link.href = dataUrl;
    link.click();
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
      <div className="flex items-center justify-center gap-4 max-w-80 mx-auto mt-4">
        <Button variant="outline" onClick={downloadQRCode}>
          Descargar código QR
        </Button>
      </div>
    </div>
  );
}
