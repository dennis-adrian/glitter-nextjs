"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { deactivateFullTableAccessAction } from "@/app/lib/reservations/full-table-actions";

/**
 * Gives back the credits held against an activated feature.
 *
 * The same command the festival's banner offers, surfaced where the held
 * credits are actually reported. It matters most after a rejected voucher: the
 * hold outlives the credits behind it, so the wallet shows a negative
 * spendable balance for something the participant never used, and the map —
 * the only other place to undo it — may be closed by then.
 */
export default function ReleaseFeatureCreditsButton({
  festivalId,
  label,
}: {
  festivalId: number;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function release() {
    startTransition(async () => {
      try {
        const result = await deactivateFullTableAccessAction({
          festivalId,
          idempotencyKey: crypto.randomUUID(),
        });
        if (!result.success) {
          toast.error(result.message);
          return;
        }
        toast.success(result.message);
        router.refresh();
      } catch (error) {
        console.error("Error releasing feature credits", error);
        toast.error("No se pudieron liberar los créditos. Intentá nuevamente.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={release}
    >
      {isPending ? "Liberando..." : label}
    </Button>
  );
}
