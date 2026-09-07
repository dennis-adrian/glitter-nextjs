"use client";

import { CoinsIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { formatCreditCount } from "@/app/components/credits/credit-amount";
import { Button, type ButtonProps } from "@/app/components/ui/button";
import { createFeatureCreditTopUpAction } from "@/app/lib/credits/purchase-actions";
import type { PurchasableFeatureType } from "@/app/lib/credits/purchase-service";

type BuyFeatureCreditsButtonProps = {
  festivalId: number;
  featureType: PurchasableFeatureType;
  /** Display only. The server recalculates the exact shortfall under lock. */
  shortfallAmount: number;
  disabled?: boolean;
  /** Matches the surrounding controls; a banner's row is shorter than a page's. */
  size?: ButtonProps["size"];
};

/**
 * Starts a credit purchase for an optional feature and sends the participant to
 * its payment page to pay and upload the voucher.
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
  size,
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
        // Straight to the payment screen: the purchase is not finished until
        // the voucher is in, so there is nowhere else useful to land.
        router.push(`/my_credits/${result.topUpId}`);
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
      size={size}
      onClick={buyCredits}
      disabled={isPending || disabled}
    >
      {isPending
        ? "Preparando la compra..."
        : `Comprar ${formatCreditCount(shortfallAmount)}`}
      <CoinsIcon className="ml-2 h-4 w-4" />
    </Button>
  );
}
