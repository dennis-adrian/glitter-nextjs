"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import { cancelFestivalDayFastPass } from "@/app/lib/fast-pass/transaction-actions";

export default function FastPassCancelFestivalDayForm({
  settingsId,
}: {
  settingsId: number;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function cancelDay() {
    if (
      !window.confirm(
        "¿Cancelar Pase Rápido para este día? Se invalidarán los pases y se crearán tareas de reembolso.",
      )
    ) {
      return;
    }
    setPending(true);
    try {
      const result = await cancelFestivalDayFastPass({ settingsId, reason });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    } catch {
      toast.error("No pudimos cancelar el día");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-destructive/40 p-4">
      <Label htmlFor="fastPassFestivalCancellationReason">
        Motivo de cancelación del día
      </Label>
      <Textarea
        id="fastPassFestivalCancellationReason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button
        type="button"
        variant="destructive"
        disabled={pending || reason.trim().length < 3}
        onClick={cancelDay}
      >
        {pending ? "Cancelando…" : "Cancelar día y preparar reembolsos"}
      </Button>
    </div>
  );
}
