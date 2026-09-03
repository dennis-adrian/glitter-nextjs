"use client";

import { CoinsIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { formatCredits } from "@/app/components/credits/credit-amount";
import { Button } from "@/app/components/ui/button";
import { createDebtCreditTopUpAction } from "@/app/lib/credits/purchase-actions";

type BuyDebtCreditsButtonProps = {
  /** Display only. The server recalculates the exact debt under lock. */
  debtAmount: number;
};

/**
 * Starts a credit purchase that clears the participant's outstanding balance.
 *
 * A negative balance is what a rejected voucher leaves once its credits were
 * already spent. It blocks every credit operation until it is cleared, so this
 * is the self-service way back — an admin clearing it by hand is the other.
 */
export default function BuyDebtCreditsButton({
  debtAmount,
}: BuyDebtCreditsButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  function buyCredits() {
    startTransition(async () => {
      try {
        const result = await createDebtCreditTopUpAction({ idempotencyKey });
        if (!result.success) {
          toast.error(result.message);
          setIdempotencyKey(crypto.randomUUID());
          return;
        }
        toast.success(result.message);
        router.refresh();
      } catch (error) {
        console.error("Error creating debt credit top-up", error);
        toast.error("No se pudo iniciar la compra. Intentá nuevamente.");
        setIdempotencyKey(crypto.randomUUID());
      }
    });
  }

  return (
    <Button type="button" onClick={buyCredits} disabled={isPending}>
      {isPending
        ? "Preparando la compra..."
        : `Regularizar ${formatCredits(debtAmount)}`}
      <CoinsIcon className="ml-2 h-4 w-4" />
    </Button>
  );
}
