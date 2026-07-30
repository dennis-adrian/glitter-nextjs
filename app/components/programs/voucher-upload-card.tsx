"use client";

import { DateTime } from "luxon";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { submitPurchaseVoucher } from "@/app/lib/programs/voucher-actions";
import { formatFullDate } from "@/app/lib/formatters";
import { useUploadThing } from "@/app/vendors/uploadthing";

type Props = {
  purchaseId: number;
  /** Present only when the buyer arrived by secure link. */
  token?: string;
  totalAmount: number;
  bankQrImageUrl: string | null;
  /** False for the shared zero-amount code, which the payer fills in. */
  qrCoversAmount: boolean;
  /** Null once the purchase is under review — the deadline no longer governs. */
  holdExpiresAt: Date | null;
  /** Newest first; empty before the first upload. */
  vouchers: { version: number; fileUrl: string; createdAt: Date }[];
  /** Copy differs when the team asked for a better photo. */
  changesRequested: boolean;
};

function formatRemaining(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function VoucherUploadCard({
  purchaseId,
  token,
  totalAmount,
  bankQrImageUrl,
  qrCoversAmount,
  holdExpiresAt,
  vouchers,
  changesRequested,
}: Props) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startUpload } = useUploadThing("sessionPurchaseVoucher");

  /**
   * Ticks only while a deadline is actually running. `null` means the purchase
   * is already under review, where the seat is held by the review itself.
   */
  const [msLeft, setMsLeft] = useState<number | null>(() =>
    holdExpiresAt ? holdExpiresAt.getTime() - Date.now() : null,
  );

  useEffect(() => {
    if (!holdExpiresAt) {
      setMsLeft(null);
      return;
    }

    const tick = () => setMsLeft(holdExpiresAt.getTime() - Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = useCallback(
    (file: File) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    },
    [previewUrl],
  );

  const expired = msLeft !== null && msLeft <= 0;

  async function handleSubmit() {
    if (!selectedFile) return;

    setIsSubmitting(true);
    try {
      const uploaded = await startUpload([selectedFile], {
        purchaseId,
        ...(token ? { token } : {}),
      });

      const results = uploaded?.[0]?.serverData?.results;
      if (!results?.imageUrl || !results?.fileKey) {
        toast.error("No pudimos subir la imagen. Intenta de nuevo.");
        return;
      }

      const result = await submitPurchaseVoucher({
        purchaseId,
        fileUrl: results.imageUrl,
        fileKey: results.fileKey,
        ...(token ? { token } : {}),
      });

      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      router.refresh();
    } catch {
      toast.error("No pudimos registrar el comprobante. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const latest = vouchers[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {changesRequested
            ? "Necesitamos otro comprobante"
            : latest
              ? "Comprobante enviado"
              : "Paga y sube tu comprobante"}
        </CardTitle>
        <CardDescription>
          {changesRequested
            ? "Revisamos tu comprobante y necesitamos una imagen distinta."
            : latest
              ? "Estamos revisando tu pago. Te avisaremos por correo."
              : `Transfiere Bs ${totalAmount} y sube la captura para confirmar tu cupo.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between rounded-lg border p-3">
          <span className="text-sm text-muted-foreground">Total a pagar</span>
          <span className="text-lg font-semibold">Bs {totalAmount}</span>
        </div>

        {msLeft !== null ? (
          <div
            className={`rounded-lg border p-3 text-sm ${
              expired
                ? "border-destructive/40 text-destructive"
                : "border-amber-500/40 text-amber-700 dark:text-amber-400"
            }`}
          >
            {expired ? (
              <>
                Tu reserva expiró y el cupo volvió a estar disponible. Vuelve a
                inscribirte si aún quieres asistir.
              </>
            ) : (
              <>
                Tu cupo está reservado por{" "}
                <strong>{formatRemaining(msLeft)}</strong>. Sube tu comprobante
                antes de las{" "}
                {formatFullDate(holdExpiresAt, DateTime.TIME_SIMPLE)}.
              </>
            )}
          </div>
        ) : null}

        {!expired && bankQrImageUrl ? (
          <div className="flex flex-col items-center gap-2">
            <Image
              src={bankQrImageUrl}
              alt="Código QR para el pago"
              width={220}
              height={220}
              className="rounded-md border bg-white p-2"
            />
            <p className="text-center text-xs text-muted-foreground">
              {qrCoversAmount ? (
                <>Escanea el QR desde tu app bancaria. Ya lleva el monto.</>
              ) : (
                <>
                  Escanea el QR desde tu app bancaria y escribe el monto:{" "}
                  <strong>Bs {totalAmount}</strong>.
                </>
              )}
            </p>
          </div>
        ) : null}

        {!expired && !bankQrImageUrl ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            No encontramos un QR de pago disponible. Escríbenos para coordinar
            tu pago.
          </p>
        ) : null}

        {latest ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Comprobante enviado (versión {latest.version})
            </p>
            <Image
              src={latest.fileUrl}
              alt={`Comprobante versión ${latest.version}`}
              width={220}
              height={280}
              className="mx-auto rounded-md border"
            />
          </div>
        ) : null}

        {expired ? null : (
          <div className="flex flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFileChange(file);
              }}
            />

            {previewUrl ? (
              <div className="flex flex-col gap-2">
                <Image
                  src={previewUrl}
                  alt="Vista previa del comprobante"
                  width={220}
                  height={280}
                  className="mx-auto rounded-md border object-cover"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting}
                  className="text-center text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:pointer-events-none"
                >
                  Cambiar imagen
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:bg-muted/50"
              >
                <UploadIcon className="h-7 w-7 text-muted-foreground/50" />
                <span className="text-sm font-medium text-muted-foreground">
                  {latest
                    ? "Elegir otra imagen"
                    : "Presiona para elegir una imagen"}
                </span>
                <span className="text-xs text-muted-foreground/70">
                  JPG, PNG o HEIC — hasta 4MB
                </span>
              </button>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!selectedFile || isSubmitting}
              className="w-full"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Enviando...
                </span>
              ) : latest ? (
                "Reemplazar comprobante"
              ) : (
                "Enviar comprobante"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
