"use client";

import { Undo2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { formatCreditCount } from "@/app/components/credits/credit-amount";
import { Button } from "@/app/components/ui/button";
import { adjustCreditAccountAction } from "@/app/lib/credits/actions";

/**
 * Undoes one admin grant or discount.
 *
 * The ledger is append-only — enforced by a database trigger, not just here —
 * so this posts the opposite entry and links it to the original rather than
 * removing anything. Both stay in the participant's history, which is the
 * point: the money moved twice and the record says so.
 *
 * The amount is not editable. A partial undo is just another adjustment, and
 * it is available from the same screen; calling it a revert would make the
 * link to the original a lie.
 */
export default function CreditRevertButton({
  userId,
  entryId,
  amount,
  disabled,
}: {
  userId: number;
  entryId: number;
  /** The original entry's signed amount. The undo posts its negation. */
  amount: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Minted per attempt, so a double click lands as one entry rather than two.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  function revert() {
    startTransition(async () => {
      try {
        const result = await adjustCreditAccountAction({
          userId,
          amount: -amount,
          reason: `Reversión del movimiento #${entryId}`,
          idempotencyKey,
          reversesEntryId: entryId,
        });
        setIdempotencyKey(crypto.randomUUID());
        if (!result.success) {
          toast.error(result.message);
          // The refusals are both "this screen is stale", so show the truth
          // rather than leaving a button that cannot work.
          router.refresh();
          return;
        }
        toast.success(result.message);
        router.refresh();
      } catch (error) {
        console.error("Error reverting credit adjustment", error);
        toast.error("No se pudo revertir el movimiento. Intentá nuevamente.");
        setIdempotencyKey(crypto.randomUUID());
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs"
      disabled={disabled || isPending}
      onClick={revert}
      title={`Revierte ${formatCreditCount(Math.abs(amount))} con un movimiento opuesto`}
    >
      <Undo2Icon className="mr-1 h-3 w-3" />
      {isPending ? "Revirtiendo..." : "Revertir"}
    </Button>
  );
}
