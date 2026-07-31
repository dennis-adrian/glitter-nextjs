"use client";

import { DateTime } from "luxon";
import Image from "next/image";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  CircleIcon,
  Clock3Icon,
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { formatMoney } from "@/app/lib/programs/pricing";
import { submitPurchaseVoucher } from "@/app/lib/programs/voucher-actions";
import { formatDateWithTime, formatFullDate } from "@/app/lib/formatters";
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
  const [isReplacing, setIsReplacing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startUpload } = useUploadThing("sessionPurchaseVoucher");

  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!holdExpiresAt) return;

    setClock(Date.now());
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  /** `null` means the purchase is under review, where the review holds the seat. */
  const msLeft = holdExpiresAt ? holdExpiresAt.getTime() - clock : null;

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
      // Splits "never picked an image" from "picked one and the upload broke".
      // No filename: it is the payer's own file and adds nothing to the funnel.
      posthog.capture(POSTHOG_EVENTS.PROGRAM_VOUCHER_FILE_SELECTED, {
        purchase_id: purchaseId,
        total_amount: totalAmount,
        file_size_bytes: file.size,
        file_type: file.type,
      });
    },
    [previewUrl, purchaseId, totalAmount],
  );

  const expired = msLeft !== null && msLeft <= 0;

  /**
   * The single loudest drop-off signal in this flow: the hold ran out while the
   * payer was on the page. Fired once, on the tick that crosses the deadline —
   * the countdown re-renders every second and must not re-report it.
   */
  const reportedExpiryRef = useRef(false);

  useEffect(() => {
    if (!expired || reportedExpiryRef.current) return;
    reportedExpiryRef.current = true;
    posthog.capture(POSTHOG_EVENTS.PROGRAM_HOLD_EXPIRED, {
      purchase_id: purchaseId,
      total_amount: totalAmount,
      had_voucher: vouchers.length > 0,
    });
  }, [expired, purchaseId, totalAmount, vouchers.length]);

  async function handleSubmit() {
    if (!selectedFile) return;

    // `vouchers` still holds the pre-submit list here, so this reads "was there
    // already one" rather than "is there one now".
    const isReplacement = vouchers.length > 0;
    const attemptProperties = {
      purchase_id: purchaseId,
      total_amount: totalAmount,
      is_replacement: isReplacement,
      access_via: token ? "token" : "account",
    };

    setIsSubmitting(true);
    try {
      const uploaded = await startUpload([selectedFile], {
        purchaseId,
        ...(token ? { token } : {}),
      });

      const results = uploaded?.[0]?.serverData?.results;
      if (!results?.imageUrl || !results?.fileKey) {
        // Distinct from a rejected voucher: the image never reached storage, so
        // the fix is upload infrastructure, not the payer's photo.
        posthog.capture(POSTHOG_EVENTS.PROGRAM_VOUCHER_FAILED, {
          ...attemptProperties,
          failure: "upload",
        });
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
        posthog.capture(POSTHOG_EVENTS.PROGRAM_VOUCHER_FAILED, {
          ...attemptProperties,
          failure: "rejected",
          reason: result.message,
        });
        toast.error(result.message);
        return;
      }

      posthog.capture(
        POSTHOG_EVENTS.PROGRAM_VOUCHER_SUBMITTED,
        attemptProperties,
      );
      toast.success(result.message);
      setSelectedFile(null);
      setIsReplacing(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      router.refresh();
    } catch (error) {
      posthog.capture(POSTHOG_EVENTS.PROGRAM_VOUCHER_FAILED, {
        ...attemptProperties,
        failure: "exception",
        reason: error instanceof Error ? error.message : "unknown",
      });
      toast.error("No pudimos registrar el comprobante. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const latest = vouchers[0];
  const isUnderReview = Boolean(latest) && !changesRequested;
  const showPaymentInstructions = !latest;
  const showUploader = !expired && (!latest || changesRequested || isReplacing);

  return (
    <Card
      className={
        isUnderReview
          ? "overflow-hidden border-primary-300 shadow-sm"
          : undefined
      }
    >
      {isUnderReview ? (
        <CardHeader className="border-b border-primary-950 bg-primary-950 text-white">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ffbe57] text-[#4b255f] shadow-sm shadow-black/25">
              <CheckIcon className="h-6 w-6" strokeWidth={3} />
            </span>
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-[#ffcf7d]">
                Comprobante recibido
              </p>
              <CardTitle className="text-2xl text-white">
                Tu pago está en revisión
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed text-primary-100">
                Tu cupo está reservado mientras verificamos el pago. Te
                avisaremos por correo cuando esté confirmado.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      ) : (
        <CardHeader>
          <CardTitle>
            {changesRequested
              ? "Necesitamos otro comprobante"
              : "Paga y sube tu comprobante"}
          </CardTitle>
          <CardDescription>
            {changesRequested
              ? "Revisamos tu comprobante y necesitamos una imagen distinta."
              : `Transfiere ${formatMoney(totalAmount)} y sube la captura para confirmar tu cupo.`}
          </CardDescription>
        </CardHeader>
      )}

      <CardContent className={isUnderReview ? "space-y-5 pt-6" : "space-y-5"}>
        {isUnderReview ? (
          <section
            aria-labelledby="payment-progress-title"
            className="space-y-3"
          >
            <h3
              id="payment-progress-title"
              className="text-sm font-semibold text-foreground"
            >
              Estado de tu inscripción
            </h3>
            <ol className="grid gap-2 sm:grid-cols-3">
              <li className="flex items-center gap-2.5 rounded-lg border border-primary-200 bg-primary-50 p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ffbe57] text-[#4b255f]">
                  <CheckIcon className="h-4 w-4" strokeWidth={3} />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-primary-800">
                    Listo
                  </p>
                  <p className="text-xs font-semibold">Comprobante enviado</p>
                </div>
              </li>
              <li className="flex items-center gap-2.5 rounded-lg border border-primary-800 bg-primary-700 p-3 text-white shadow-sm">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-primary-700">
                  <Clock3Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-primary-100">
                    Ahora
                  </p>
                  <p className="text-xs font-semibold">Revisión del pago</p>
                </div>
              </li>
              <li className="flex items-center gap-2.5 rounded-lg border bg-background p-3 text-foreground/70">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-foreground/25 bg-background">
                  <CircleIcon className="h-3 w-3" />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide">
                    Después
                  </p>
                  <p className="text-xs font-semibold">Entrada confirmada</p>
                </div>
              </li>
            </ol>
          </section>
        ) : null}

        {showPaymentInstructions ? (
          <div className="flex items-baseline justify-between rounded-lg border p-3">
            <span className="text-sm text-muted-foreground">Total a pagar</span>
            <span className="text-lg font-semibold">
              {formatMoney(totalAmount)}
            </span>
          </div>
        ) : null}

        {showPaymentInstructions && msLeft !== null ? (
          <div
            className={`rounded-lg border p-3 text-sm ${
              expired
                ? "border-destructive/40 text-destructive"
                : "border-amber-200 text-amber-900 bg-amber-50"
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

        {showPaymentInstructions && !expired && bankQrImageUrl ? (
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
                  <strong>{formatMoney(totalAmount)}</strong>.
                </>
              )}
            </p>
          </div>
        ) : null}

        {showPaymentInstructions && !expired && !bankQrImageUrl ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            No encontramos un QR de pago disponible. Escríbenos para coordinar
            tu pago.
          </p>
        ) : null}

        {latest ? (
          <div className="flex items-center gap-4 rounded-xl border bg-muted/20 p-3">
            <a
              href={latest.fileUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir comprobante enviado"
              className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Image
                src={latest.fileUrl}
                alt={`Comprobante versión ${latest.version}`}
                width={72}
                height={88}
                className="h-[88px] w-[72px] rounded-lg border bg-background object-cover"
              />
            </a>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Tu comprobante</p>
              <p className="text-sm text-muted-foreground">
                {formatMoney(totalAmount)} · Enviado{" "}
                {formatDateWithTime(latest.createdAt)}
              </p>
              <a
                href={latest.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Ver imagen
                <ExternalLinkIcon className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ) : null}

        {isUnderReview && !isReplacing ? (
          <div className="border-t pt-4 text-center">
            <p className="mb-2 text-xs text-muted-foreground">
              ¿Enviaste una imagen equivocada?
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsReplacing(true)}
            >
              <RefreshCwIcon className="mr-2 h-3.5 w-3.5" />
              Reemplazar comprobante
            </Button>
          </div>
        ) : null}

        {showUploader ? (
          <div className="flex flex-col gap-3">
            {isReplacing ? (
              <div className="flex items-start justify-between gap-3 rounded-lg bg-muted/60 p-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  La nueva imagen reemplazará el comprobante que ya enviaste.
                </p>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setIsReplacing(false);
                    setSelectedFile(null);
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                    setPreviewUrl(null);
                  }}
                  className="shrink-0 text-xs font-medium underline underline-offset-2"
                >
                  Cancelar
                </button>
              </div>
            ) : null}

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
        ) : null}
      </CardContent>
    </Card>
  );
}
