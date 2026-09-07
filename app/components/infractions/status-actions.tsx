"use client";

import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { changeInfractionStatus } from "@/app/lib/infractions/actions";
import type { InfractionStatus } from "@/app/lib/infractions/definitions";
import { canTransitionInfractionStatus } from "@/app/lib/infractions/lifecycle";
import { infractionStatusLabel } from "@/app/lib/infractions/mappers";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

const ACTION_TARGETS: {
  toStatus: InfractionStatus;
  label: string;
  requiresNote?: "voidReason" | "resolutionNotes" | "note";
}[] = [
  { toStatus: "under_review", label: "Iniciar revisión" },
  { toStatus: "resolved", label: "Resolver", requiresNote: "resolutionNotes" },
  { toStatus: "voided", label: "Anular", requiresNote: "voidReason" },
  { toStatus: "pending", label: "Reabrir a pendiente" },
];

export default function InfractionStatusActions({
  infractionId,
  status,
}: {
  infractionId: number;
  status: InfractionStatus;
}) {
  const router = useRouter();
  const [pendingTarget, setPendingTarget] = useState<InfractionStatus | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const available = ACTION_TARGETS.filter((action) =>
    canTransitionInfractionStatus(status, action.toStatus),
  );

  const activeAction = available.find(
    (action) => action.toStatus === pendingTarget,
  );

  const submit = () => {
    if (!activeAction) return;

    startTransition(async () => {
      const response = await changeInfractionStatus({
        infractionId,
        toStatus: activeAction.toStatus,
        note: activeAction.requiresNote === "note" ? note : undefined,
        voidReason:
          activeAction.requiresNote === "voidReason" ? note : undefined,
        resolutionNotes:
          activeAction.requiresNote === "resolutionNotes" ? note : undefined,
      });

      if (!response.success) {
        toast.error(response.message);
        return;
      }

      toast.success(response.message);
      setPendingTarget(null);
      setNote("");
      router.refresh();
    });
  };

  if (available.length === 0) return null;

  return (
    <div className="space-y-3 rounded-md border p-4">
      <h3 className="font-medium text-sm">Cambiar estado</h3>
      <div className="flex flex-wrap gap-2">
        {available.map((action) => (
          <Button
            key={action.toStatus}
            type="button"
            variant={pendingTarget === action.toStatus ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setPendingTarget(action.toStatus);
              setNote("");
            }}
          >
            {action.label}
          </Button>
        ))}
      </div>

      {activeAction && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Nuevo estado: {infractionStatusLabel[activeAction.toStatus]}
          </p>
          {(activeAction.requiresNote === "voidReason" ||
            activeAction.requiresNote === "resolutionNotes") && (
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                activeAction.requiresNote === "voidReason"
                  ? "Motivo de anulación (obligatorio)"
                  : "Notas de resolución (opcional)"
              }
              maxLength={2000}
            />
          )}
          <Button
            type="button"
            onClick={submit}
            disabled={
              isPending ||
              (activeAction.requiresNote === "voidReason" && !note.trim())
            }
          >
            {isPending && <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />}
            Confirmar cambio
          </Button>
        </div>
      )}
    </div>
  );
}
