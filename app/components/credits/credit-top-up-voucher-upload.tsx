"use client";

import { AlertCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { formatCredits } from "@/app/components/credits/credit-amount";
import PaymentProofUpload from "@/app/components/payments/payment-proof-upload";
import { Alert, AlertDescription } from "@/app/components/ui/alert";

type CreditTopUpVoucherUploadProps = {
  topUpId: number;
  amount: number;
  /** ISO timestamp; the server rejects an upload that arrives after it. */
  uploadDeadlineAt: string;
};

function remainingLabel(msLeft: number) {
  const totalSeconds = Math.max(0, Math.floor(msLeft / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The countdown is a courtesy, not the rule: the ten-minute window is enforced
 * in the UploadThing callback, so a client whose clock drifts still cannot
 * create credits late.
 */
export default function CreditTopUpVoucherUpload({
  topUpId,
  amount,
  uploadDeadlineAt,
}: CreditTopUpVoucherUploadProps) {
  const router = useRouter();
  const deadline = new Date(uploadDeadlineAt).getTime();
  // Left unset through the server pass: reading the clock during render makes
  // the markup differ from what hydration produces a moment later.
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    let expired = false;
    const tick = () => {
      const next = deadline - Date.now();
      if (next <= 0) {
        if (expired) return;
        expired = true;
        setMsLeft(next);
        router.refresh();
        return;
      }
      setMsLeft(next);
    };
    // Deferred so the first reading of the clock happens after hydration.
    const firstTick = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(firstTick);
      clearInterval(timer);
    };
  }, [deadline, router]);

  if (msLeft !== null && msLeft <= 0) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon className="h-4 w-4" />
        <AlertDescription>
          El plazo para subir el comprobante venció y no se acreditaron
          créditos. Podés empezar una compra nueva.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-muted p-3 text-sm">
        <p className="font-medium">
          Transferí {formatCredits(amount)} y subí el comprobante
        </p>
        <p className="text-muted-foreground">
          {msLeft === null ? (
            "Tenés unos minutos para subirlo. Si se vence el plazo no se acreditan créditos y tenés que empezar de nuevo."
          ) : (
            <>
              Te quedan{" "}
              <span className="tabular-nums">{remainingLabel(msLeft)}</span>{" "}
              minutos. Si se vence el plazo no se acreditan créditos y tenés que
              empezar de nuevo.
            </>
          )}
        </p>
      </div>

      <PaymentProofUpload
        endpoint="creditTopUpVoucher"
        uploadInput={{ topUpId }}
        submitLabel="Subir comprobante"
        onUploading={setIsUploading}
        onUploadComplete={() => {
          toast.success(
            "Recibimos tu comprobante. Ya podés usar tus créditos en funciones opcionales.",
          );
          router.refresh();
        }}
      />
      {isUploading && (
        <p className="text-center text-xs text-muted-foreground">
          No cierres esta página hasta que termine la carga.
        </p>
      )}
    </div>
  );
}
