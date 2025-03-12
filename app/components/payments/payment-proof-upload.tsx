"use client";

import { toast } from "sonner";
import { UploadButton } from "@/app/vendors/uploadthing";
import Image from "next/image";
import { Loader2Icon } from "lucide-react";

export default function PaymentProofUpload({
  voucherImageUrl,
  onUploadComplete,
}: {
  voucherImageUrl?: string;
  onUploadComplete: (imageUrl: string) => void;
}) {
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
        <div className="h-[200px] w-[200px] p-4 border border-dashed mx-auto flex justify-center items-center">
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

          onUploadComplete(results.imageUrl);
        }}
        content={{
          button({ ready, isUploading, uploadProgress }) {
            if (isUploading && uploadProgress === 100) {
              return (
                <Loader2Icon className="w-4 h-4 text-primary-500 animate-spin" />
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
              return "bg-transparent text-xs text-muted-foreground border";
            }
            if (isUploading) {
              return "bg-transparent text-xs text-muted-foreground border after:bg-primary-400/60";
            }
            return "bg-transparent text-xs text-purple-700 border border-primary-500 hover:text-primary-500 hover:bg-primary-200/20 hover:border-primary-500";
          },
        }}
      />
    </div>
  );
}
