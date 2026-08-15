"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import { cancelFastPassSale } from "@/app/lib/fast-pass/transaction-actions";

export default function FastPassCancelSaleForm({
  saleTransactionId,
}: {
  saleTransactionId: number;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [wristbandsRecovered, setWristbandsRecovered] = useState(false);
  const [pending, setPending] = useState(false);

  async function cancelSale() {
    if (
      !window.confirm("¿Registrar la cancelación? La venta no se eliminará.")
    ) {
      return;
    }
    setPending(true);
    try {
      const result = await cancelFastPassSale({
        saleTransactionId,
        reason,
        wristbandsRecovered,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    } catch {
      toast.error("No pudimos cancelar la venta");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="min-w-64">
      <summary className="cursor-pointer text-sm text-destructive">
        Cancelar venta
      </summary>
      <div className="mt-3 space-y-3">
        <Label htmlFor={`reason-${saleTransactionId}`}>Motivo</Label>
        <Textarea
          id={`reason-${saleTransactionId}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo obligatorio"
        />
        <div className="flex items-start gap-2">
          <Checkbox
            id={`wristbands-${saleTransactionId}`}
            checked={wristbandsRecovered}
            onCheckedChange={(checked) =>
              setWristbandsRecovered(checked === true)
            }
          />
          <Label htmlFor={`wristbands-${saleTransactionId}`}>
            Todas las pulseras fueron recuperadas
          </Label>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={pending || reason.trim().length < 3}
          onClick={cancelSale}
        >
          {pending ? "Cancelando…" : "Registrar cancelación"}
        </Button>
      </div>
    </details>
  );
}
