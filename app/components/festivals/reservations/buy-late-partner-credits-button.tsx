"use client";

import { CoinsIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { createLatePartnerCreditTopUpAction } from "@/app/lib/reservations/late-partner-actions";

/**
 * Buys the exact shortfall for adding a partner.
 *
 * Its own button rather than `BuyFeatureCreditsButton` because this is the one
 * feature whose price is not the festival's configured figure alone: it also
 * carries the difference between the individual and shared price of this
 * reservation. So the browser sends only the reservation id, and the server
 * derives the total from that reservation's own snapshots — no amount is
 * quoted here that the server has to trust.
 *
 * It reserves no partner. §8.3 is explicit that nobody is claimed during a
 * top-up, so the participant comes back and chooses when they have the
 * credits; if they change their mind, the same credits pay their reservation.
 */
export default function BuyLatePartnerCreditsButton({
  reservationId,
}: {
  reservationId: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  function buyCredits() {
    startTransition(async () => {
      try {
        const result = await createLatePartnerCreditTopUpAction({
          reservationId,
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
        console.error("Error buying late partner credits", error);
        toast.error("No se pudo iniciar la compra. Intentá nuevamente.");
        setIdempotencyKey(crypto.randomUUID());
      }
    });
  }

  return (
    <Button
      type="button"
      className="w-full sm:w-auto"
      disabled={isPending}
      onClick={buyCredits}
    >
      <CoinsIcon className="mr-2 h-4 w-4" />
      {isPending ? "Preparando la compra…" : "Comprar los créditos que faltan"}
    </Button>
  );
}
