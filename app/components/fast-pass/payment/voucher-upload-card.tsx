"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import FastPassHoldCountdown from "@/app/components/fast-pass/payment/hold-countdown";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatMoney } from "@/app/lib/programs/pricing";
import { submitFastPassVoucher } from "@/app/lib/fast-pass/voucher-actions";
import { useUploadThing } from "@/app/vendors/uploadthing";

type Props = {
  purchaseId: number;
  token?: string;
  totalAmount: number;
  bankQrImageUrl: string | null;
  holdExpiresAt: Date | null;
  changesRequested: boolean;
  vouchers: { version: number; fileUrl: string; createdAt: Date }[];
};

export default function FastPassVoucherUploadCard({
  purchaseId,
  token,
  totalAmount,
  bankQrImageUrl,
  holdExpiresAt,
  changesRequested,
  vouchers,
}: Props) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startUpload } = useUploadThing("fastPassVoucher");
  const current = vouchers[0];

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  /** Clearing the input too, so re-picking the same file still fires change. */
  function clearSelection() {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    if (!selectedFile) {
      toast.error("Selecciona una imagen del comprobante");
      return;
    }
    if (!token) {
      toast.error("Necesitas el enlace seguro para subir el comprobante");
      return;
    }

    setIsSubmitting(true);
    try {
      const uploaded = await startUpload([selectedFile], {
        purchaseId,
        token,
      });

      const results = uploaded?.[0]?.serverData?.results;
      if (!results?.imageUrl || !results?.fileKey) {
        toast.error("No pudimos subir el comprobante");
        return;
      }

      const result = await submitFastPassVoucher({
        purchaseId,
        token,
        fileUrl: results.imageUrl,
        fileKey: results.fileKey,
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      clearSelection();
      router.refresh();
    } catch {
      toast.error("No pudimos enviar el comprobante");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pago con QR bancario</CardTitle>
        <CardDescription>
          Transferí {formatMoney(totalAmount)} y subí el comprobante dentro del
          plazo de reserva.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FastPassHoldCountdown expiresAt={holdExpiresAt} />

        {changesRequested ? (
          <p className="text-sm text-amber-600">
            Te pedimos un comprobante más claro. Subí una nueva imagen.
          </p>
        ) : null}

        {bankQrImageUrl ? (
          <div className="overflow-hidden rounded-md border">
            <Image
              src={bankQrImageUrl}
              alt="QR bancario"
              width={400}
              height={400}
              className="mx-auto h-auto w-full max-w-xs object-contain"
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            QR de pago no disponible. Contacta al equipo del festival.
          </p>
        )}

        {current && !selectedFile ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Comprobante enviado (v{current.version})
            </p>
            <a
              href={current.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary text-sm underline"
            >
              Ver comprobante
            </a>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {previewUrl ? (
          <div className="overflow-hidden rounded-md border">
            <Image
              src={previewUrl}
              alt="Vista previa del comprobante"
              width={400}
              height={400}
              className="h-auto w-full object-contain"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
          >
            <UploadIcon className="mr-2 h-4 w-4" />
            {selectedFile ? "Cambiar imagen" : "Elegir comprobante"}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedFile}
          >
            {isSubmitting ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Enviando…
              </>
            ) : (
              "Enviar comprobante"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
