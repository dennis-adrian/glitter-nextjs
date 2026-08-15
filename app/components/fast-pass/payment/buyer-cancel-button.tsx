"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { cancelFastPassPurchaseByBuyer } from "@/app/lib/fast-pass/voucher-actions";

type Props = {
  purchaseId: number;
  token: string;
};

export default function FastPassBuyerCancelButton({
  purchaseId,
  token,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleCancel() {
    const confirmed = window.confirm(
      "¿Cancelar esta reserva? Solo cancelá si todavía no transferiste el pago. Esta acción no se puede deshacer.",
    );
    if (!confirmed) return;

    setPending(true);
    try {
      const result = await cancelFastPassPurchaseByBuyer({
        purchaseId,
        token,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    } catch {
      toast.error("No pudimos cancelar la reserva");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleCancel}
      disabled={pending}
    >
      {pending ? "Cancelando…" : "Cancelar reserva"}
    </Button>
  );
}
