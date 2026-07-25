"use client";

import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { revokeSanction } from "@/app/lib/sanctions/actions";
import { canRevokeSanction } from "@/app/lib/sanctions/lifecycle";
import type { SanctionStatus } from "@/app/lib/sanctions/definitions";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export default function RevokeSanctionActions({
  sanctionId,
  status,
}: {
  sanctionId: number;
  status: SanctionStatus;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!canRevokeSanction(status)) return null;

  const submit = () => {
    startTransition(async () => {
      const response = await revokeSanction({
        sanctionId,
        revocationReason: reason,
      });
      if (!response.success) {
        toast.error(response.message);
        return;
      }
      toast.success(response.message);
      setOpen(false);
      setReason("");
      router.refresh();
    });
  };

  return (
    <section className="space-y-3 rounded-md border p-4">
      <h2 className="font-medium text-sm">Revocar sanción</h2>
      {!open ? (
        <Button
          type="button"
          variant="destructive"
          onClick={() => setOpen(true)}
        >
          Revocar
        </Button>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Motivo de revocación (obligatorio)"
            maxLength={2000}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={submit}
              disabled={isPending || !reason.trim()}
            >
              {isPending && (
                <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
              )}
              Confirmar revocación
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setReason("");
              }}
              disabled={isPending}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
