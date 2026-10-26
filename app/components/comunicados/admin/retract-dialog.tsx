"use client";

import { MoreHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { retractDialogLines } from "@/app/components/comunicados/admin/retract-copy";
import CreditGiftLengthCounter from "@/app/components/credit_gifts/admin/credit-gift-length-counter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Textarea } from "@/app/components/ui/textarea";
import type { ComunicadoRetractCounts } from "@/app/lib/comunicados/contracts";
import { COMUNICADO_RETRACT_REASON_MAX } from "@/app/lib/comunicados/definitions";
import { retractComunicadoAction } from "@/app/lib/comunicados/retract-actions";

type RetractComunicadoMenuProps = {
  comunicadoId: number;
  title: string;
  /** The report's, so the dialog says what the report will show (G6). */
  counts: ComunicadoRetractCounts;
};

/**
 * "⋯ Retirar…" on a sent comunicado's page (docs/IMPLEMENTATION-comunicados.md
 * F3, G7). A plain confirmation, not typed: retracting removes rather than
 * sends, and "Duplicar" recovers from it. The reason is the team's and
 * required. A refusal keeps what was typed, for another try.
 */
export default function RetractComunicadoMenu({
  comunicadoId,
  title,
  counts,
}: RetractComunicadoMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const trimmed = reason.trim();
  const valid =
    trimmed.length >= 1 && trimmed.length <= COMUNICADO_RETRACT_REASON_MAX;
  const lines = retractDialogLines(counts);

  function retract() {
    if (!valid) return;
    startTransition(async () => {
      try {
        const result = await retractComunicadoAction({
          comunicadoId,
          reason: trimmed,
        });
        if (result.success) {
          toast.success(result.message);
          setReason("");
        } else {
          toast.error(result.message);
        }
        setOpen(false);
        router.refresh();
      } catch (error) {
        console.error("Error retracting a comunicado", error);
        toast.error("No pudimos retirarlo. Probá de nuevo.");
      }
    });
  }

  return (
    <>
      {/* Not modal: the menu opens a dialog, and a modal menu would leave
          the page inert behind it. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Acciones del comunicado"
          >
            <MoreHorizontalIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            Retirar…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={open}
        onOpenChange={(next) => !isPending && setOpen(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Retirar «{title}»?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>{lines.disappears}</p>
                <p>{lines.emails}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={reasonId} className="text-sm font-medium">
                Motivo (solo para el equipo)
              </label>
              <CreditGiftLengthCounter
                length={reason.length}
                max={COMUNICADO_RETRACT_REASON_MAX}
              />
            </div>
            <Textarea
              id={reasonId}
              value={reason}
              maxLength={COMUNICADO_RETRACT_REASON_MAX}
              onChange={(event) => setReason(event.target.value)}
              disabled={isPending}
              rows={3}
              aria-describedby={`${reasonId}-hint`}
            />
            <p
              id={`${reasonId}-hint`}
              className="text-xs text-muted-foreground"
            >
              Obligatorio, hasta {COMUNICADO_RETRACT_REASON_MAX} caracteres.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending || !valid}
              onClick={(event) => {
                // Stays open, and busy, until the answer comes back.
                event.preventDefault();
                retract();
              }}
            >
              {isPending ? "Retirando…" : "Retirar comunicado"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
