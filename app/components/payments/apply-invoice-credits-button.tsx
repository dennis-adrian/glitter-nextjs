"use client";

import { applyInvoiceCreditsAction } from "@/app/lib/reservations/payment-actions";
import { formatCredits } from "@/app/components/credits/credit-amount";
import { Button } from "@/app/components/ui/button";
import { CoinsIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type ApplyInvoiceCreditsButtonProps = {
  invoiceId: number;
  /** Display only. The server recalculates the safe maximum under lock. */
  applicableAmount: number;
  /** When set the control stays visible but disabled, and says why. */
  disabledReason?: string;
};

/** Explicit opt-in: the server determines the safe maximum allocation. */
export default function ApplyInvoiceCreditsButton({
  invoiceId,
  applicableAmount,
  disabledReason,
}: ApplyInvoiceCreditsButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  function applyCredits() {
    startTransition(async () => {
      try {
        const result = await applyInvoiceCreditsAction({
          invoiceId,
          idempotencyKey,
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        setIdempotencyKey(crypto.randomUUID());
        router.refresh();
      } catch (error) {
        console.error("Error applying invoice credits", error);
        toast.error("No se pudieron aplicar tus créditos. Intentá nuevamente.");
      }
    });
  }

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={applyCredits}
        disabled={isPending || Boolean(disabledReason)}
      >
        {isPending
          ? "Aplicando créditos..."
          : `Usar ${formatCredits(applicableAmount)} de mis créditos`}
        <CoinsIcon className="ml-2 h-4 w-4" />
      </Button>
      {disabledReason && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {disabledReason}
        </p>
      )}
    </div>
  );
}
