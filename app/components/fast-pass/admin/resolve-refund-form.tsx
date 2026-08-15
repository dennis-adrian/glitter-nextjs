"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import { resolveFastPassRefund } from "@/app/lib/fast-pass/transaction-actions";

type Props = {
  refundId: number;
};

export default function FastPassResolveRefundForm({ refundId }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await resolveFastPassRefund({
        refundId,
        resolutionNotes: notes,
        resolutionReference: reference.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    } catch {
      toast.error("No pudimos registrar el reembolso");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t pt-4">
      <div className="space-y-2">
        <Label htmlFor={`notes-${refundId}`}>Notas de resolución</Label>
        <Textarea
          id={`notes-${refundId}`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          required
          minLength={3}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`ref-${refundId}`}>Referencia (opcional)</Label>
        <Input
          id={`ref-${refundId}`}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Guardando…" : "Marcar como pagado"}
      </Button>
    </form>
  );
}
