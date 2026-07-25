"use client";

import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { updateSanctionFestivalCounting } from "@/app/lib/sanctions/actions";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export default function FestivalCountingAction({
  sanctionId,
  festivalId,
  countsTowardDuration,
}: {
  sanctionId: number;
  festivalId: number;
  countsTowardDuration: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const willCount = !countsTowardDuration;

  const submit = () => {
    startTransition(async () => {
      const response = await updateSanctionFestivalCounting({
        sanctionId,
        festivalId,
        countsTowardDuration: willCount,
        reason: reason.trim(),
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

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        {willCount ? "Restaurar al conteo" : "Excluir del conteo"}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md bg-muted/50 p-3">
      <Textarea
        aria-label={
          willCount
            ? "Motivo para restaurar este festival al conteo"
            : "Motivo para excluir este festival del conteo"
        }
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={
          willCount
            ? "Motivo para restaurar este festival"
            : "Motivo para excluir este festival"
        }
        maxLength={2000}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={isPending || !reason.trim()}
        >
          {isPending && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
          Confirmar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
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
  );
}
