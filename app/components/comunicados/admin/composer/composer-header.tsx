"use client";

import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { AutosaveStatus } from "@/app/components/comunicados/admin/composer/use-autosave";
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
import { Badge } from "@/app/components/ui/badge";
import { Button, buttonVariants } from "@/app/components/ui/button";
import { COMUNICADO_STATUS_LABELS } from "@/app/lib/comunicados/definitions";
import { cn } from "@/app/lib/utils";

export const SAVE_RETRY_TEXT =
  "No se pudo guardar. Reintentamos en unos segundos.";

/** "Guardado" · "Guardando…" · "No se pudo guardar. Reintentamos…". */
function SaveState({ status }: { status: AutosaveStatus }) {
  if (status.kind === "blocked") return null;
  const failed = status.kind === "retrying" || status.kind === "invalid";
  const Icon =
    status.kind === "saved"
      ? CheckIcon
      : status.kind === "saving"
        ? Loader2Icon
        : AlertCircleIcon;
  const text =
    status.kind === "saved"
      ? "Guardado"
      : status.kind === "saving"
        ? "Guardando…"
        : status.kind === "retrying"
          ? SAVE_RETRY_TEXT
          : `No se pudo guardar: ${status.message}`;
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-sm",
        failed ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
      )}
      role="status"
      aria-live="polite"
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          status.kind === "saving" && "animate-spin",
        )}
        aria-hidden
      />
      {text}
    </span>
  );
}

/**
 * The composer's top line (docs/IMPLEMENTATION-comunicados.md G4): the way
 * back, the state, whether it is saved, and "Descartar borrador".
 */
export default function ComposerHeader({
  status,
  onDiscard,
  discarding,
}: {
  status: AutosaveStatus;
  onDiscard: () => Promise<boolean>;
  discarding: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href="/dashboard/communications"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-3",
          )}
        >
          <ArrowLeftIcon className="mr-1 h-4 w-4" aria-hidden />
          Comunicados
        </Link>
        <Badge variant="outline">{COMUNICADO_STATUS_LABELS.draft}</Badge>
        <SaveState status={status} />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-red-600 hover:text-red-700 dark:text-red-400"
        disabled={discarding}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2Icon className="mr-1.5 h-4 w-4" aria-hidden />
        Descartar borrador
      </Button>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(next) => !discarding && setConfirmOpen(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar este borrador?</AlertDialogTitle>
            <AlertDialogDescription>
              No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={discarding}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={discarding}
              onClick={(event) => {
                event.preventDefault();
                void onDiscard().then((discarded) => {
                  if (!discarded) setConfirmOpen(false);
                });
              }}
            >
              {discarding ? "Descartando…" : "Descartar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
