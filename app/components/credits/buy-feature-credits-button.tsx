"use client";

import { CoinsIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { formatCredits } from "@/app/components/credits/credit-amount";
import { Button } from "@/app/components/ui/button";
import { createFeatureCreditTopUpAction } from "@/app/lib/credits/purchase-actions";
import type { PurchasableFeatureType } from "@/app/lib/credits/purchase-service";

type BuyFeatureCreditsButtonProps = {
  festivalId: number;
  featureType: PurchasableFeatureType;
  /** Display only. The server recalculates the exact shortfall under lock. */
  shortfallAmount: number;
  disabled?: boolean;
};

/**
 * Starts a credit purchase for an optional feature and sends the participant to
 * the wallet to upload the voucher.
 *
 * It activates nothing: the purchase only funds the wallet, and the participant
 * comes back to the panel to decide. Credits bought here are never stranded —
 * if they change their mind the same credits pay their reservation instead.
 */
export default function BuyFeatureCreditsButton({
  festivalId,
  featureType,
  shortfallAmount,
  disabled,
}: BuyFeatureCreditsButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  function buyCredits() {
    startTransition(async () => {
      try {
        const result = await createFeatureCreditTopUpAction({
          festivalId,
          featureType,
          idempotencyKey,
        });
        if (!result.success) {
          toast.error(result.message);
          setIdempotencyKey(crypto.randomUUID());
          return;
        }
        toast.success(result.message);
        router.push("/my_credits");
      } catch (error) {
        console.error("Error creating feature credit top-up", error);
        toast.error("No se pudo iniciar la compra. Intentá nuevamente.");
        setIdempotencyKey(crypto.randomUUID());
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={buyCredits}
      disabled={isPending || disabled}
    >
      {isPending
        ? "Preparando la compra..."
        : `Comprar ${formatCredits(shortfallAmount)} en créditos`}
      <CoinsIcon className="ml-2 h-4 w-4" />
    </Button>
  );
}
