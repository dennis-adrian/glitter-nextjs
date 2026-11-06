"use client";

import { RotateCcwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  retryButtonLabel,
  retryDialogText,
} from "@/app/components/comunicados/admin/report/retry-copy";
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
import type { ComunicadoRetryCounts } from "@/app/lib/comunicados/contracts";
import { retryFailedComunicadoAction } from "@/app/lib/comunicados/retry-actions";

type RetryFailedButtonProps = {
  comunicadoId: number;
  /** The report's, so the dialog says what the retry will reach (G6). */
  counts: ComunicadoRetryCounts;
};

/**
 * "Reintentar fallidos (N)" on a sent comunicado's page
 * (docs/IMPLEMENTATION-comunicados.md G6): only when something failed. A
 * plain confirmation. A refusal stays in the dialog, so it is read where it
 * was asked; the page refreshes once the dialog is closed, as the numbers it
 * showed may be out of date.
 */
export default function RetryFailedButton({
  comunicadoId,
  counts,
}: RetryFailedButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const label = retryButtonLabel(counts);
  if (label === null) return null;

  function changeOpen(next: boolean) {
    if (isPending) return;
    setOpen(next);
    if (next || failure === null) return;
    setFailure(null);
    router.refresh();
  }

  function retry() {
    setFailure(null);
    startTransition(async () => {
      try {
        const result = await retryFailedComunicadoAction(comunicadoId);
        if (!result.success) {
          setFailure(result.message);
          return;
        }
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } catch (error) {
        console.error("Error retrying a comunicado's failures", error);
        setFailure("No pudimos reintentarlo. Probá de nuevo.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <RotateCcwIcon className="mr-2 h-4 w-4" aria-hidden />
        {label}
      </Button>

      <AlertDialog open={open} onOpenChange={changeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reintentar los fallidos?</AlertDialogTitle>
            <AlertDialogDescription>
              {retryDialogText(counts)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {failure && (
            <p
              className="rounded-lg border border-[#E8356A] bg-[#E8356A]/10 p-3 text-sm"
              role="alert"
            >
              {failure}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                // Stays open, and busy, until the answer comes back.
                event.preventDefault();
                retry();
              }}
            >
              {isPending ? "Reintentando…" : "Reintentar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
