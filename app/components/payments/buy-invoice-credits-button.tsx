"use client";

import { CoinsIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { formatCredits } from "@/app/components/credits/credit-amount";
import { Button } from "@/app/components/ui/button";
import { createInvoiceCreditTopUpAction } from "@/app/lib/reservations/payment-actions";

type BuyInvoiceCreditsButtonProps = {
  invoiceId: number;
  /** Display only. The server recalculates the exact shortfall under lock. */
  shortfallAmount: number;
};

/**
 * Starts a credit purchase for this invoice and sends the participant to the
 * wallet to upload the voucher. It reserves nothing: the stand, the invoice,
 * and its deadline are untouched while the purchase is open.
 */
export default function BuyInvoiceCreditsButton({
  invoiceId,
  shortfallAmount,
}: BuyInvoiceCreditsButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  function buyCredits() {
    startTransition(async () => {
      try {
        const result = await createInvoiceCreditTopUpAction({
          invoiceId,
          idempotencyKey,
        });
        if (!result.success) {
          toast.error(result.message);
          setIdempotencyKey(crypto.randomUUID());
          return;
        }
        toast.success(result.message);
        // Straight to the payment screen: the purchase is not finished until
        // the voucher is in, so there is nowhere else useful to land.
        router.push(`/my_credits/${result.data.topUpId}`);
      } catch (error) {
        console.error("Error creating invoice credit top-up", error);
        toast.error("No se pudo iniciar la compra. Intentá nuevamente.");
        setIdempotencyKey(crypto.randomUUID());
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={buyCredits}
      disabled={isPending}
    >
      {isPending
        ? "Preparando la compra..."
        : `Comprar ${formatCredits(shortfallAmount)} en créditos`}
      <CoinsIcon className="ml-2 h-4 w-4" />
    </Button>
  );
}
