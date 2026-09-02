"use client";

import { applyInvoiceCreditsAction } from "@/app/lib/reservations/payment-actions";
import { Button } from "@/app/components/ui/button";
import { CoinsIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type ApplyInvoiceCreditsButtonProps = {
  invoiceId: number;
};

/** Explicit opt-in: the server determines the safe maximum allocation. */
export default function ApplyInvoiceCreditsButton({
  invoiceId,
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
    <div className="mt-4 border-t pt-4">
      <p className="mb-3 text-center text-sm text-muted-foreground">
        Aplicaremos hasta el saldo confirmado disponible. Los créditos en
        revisión no se pueden usar para esta factura.
      </p>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={applyCredits}
        disabled={isPending}
      >
        {isPending ? "Aplicando créditos..." : "Usar mis créditos"}
        <CoinsIcon className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
