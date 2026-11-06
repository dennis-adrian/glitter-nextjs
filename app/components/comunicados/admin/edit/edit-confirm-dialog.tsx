"use client";

import { MailWarningIcon } from "lucide-react";
import { useState, useTransition } from "react";

import {
  EDIT_DIALOG_TITLE,
  EDIT_SAVE_FAILED_TEXT,
  editDialogLines,
} from "@/app/components/comunicados/admin/edit/edit-copy";
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
import type {
  ComunicadoRetractCounts,
  EditComunicadoInput,
  EditComunicadoResult,
} from "@/app/lib/comunicados/contracts";
import { editComunicadoAction } from "@/app/lib/comunicados/edit-actions";

type EditConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What saving sends: the page's fields as they are now. */
  input: EditComunicadoInput;
  /** The report's, so the dialog says what the edit reaches (G7). */
  counts: ComunicadoRetractCounts;
  sendEmail: boolean;
  sendPush: boolean;
  /** The campaign is still processing. */
  sending: boolean;
  essential: boolean;
  /**
   * The server's answer; a request that failed outright arrives as
   * `FAILED`. The dialog closes on a refusal, which the page shows next to
   * its button, and stays busy on a success while the page moves on.
   */
  onResult: (result: EditComunicadoResult) => void;
};

/**
 * "¿Guardar los cambios?" (docs/IMPLEMENTATION-comunicados.md F1, F2, G7):
 * where the new text shows and what stays as it arrived, from the report's
 * numbers. A plain confirmation: an edit reaches nobody new.
 */
export default function EditConfirmDialog({
  open,
  onOpenChange,
  input,
  counts,
  sendEmail,
  sendPush,
  sending,
  essential,
  onResult,
}: EditConfirmDialogProps) {
  const [isPending, startTransition] = useTransition();
  // Saved: the page is on its way to the comunicado; no second save.
  const [saved, setSaved] = useState(false);
  const busy = isPending || saved;
  const lines = editDialogLines({
    counts,
    sendEmail,
    sendPush,
    sending,
    essential,
  });

  function save() {
    startTransition(async () => {
      let result: EditComunicadoResult;
      try {
        result = await editComunicadoAction(input);
      } catch (error) {
        console.error("Error editing a sent comunicado", error);
        result = {
          success: false,
          code: "FAILED",
          message: EDIT_SAVE_FAILED_TEXT,
        };
      }
      if (result.success) {
        setSaved(true);
      } else {
        onOpenChange(false);
      }
      onResult(result);
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
    >
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{EDIT_DIALOG_TITLE}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>{lines.inbox}</p>
              {lines.emails && <p>{lines.emails}</p>}
              {lines.devices && <p>{lines.devices}</p>}
              {lines.sending && <p>{lines.sending}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {lines.essential && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/70 dark:bg-amber-950/40 dark:text-amber-100">
            <MailWarningIcon
              className="mt-0.5 h-4 w-4 shrink-0 opacity-80"
              aria-hidden
            />
            <p>{lines.essential}</p>
          </div>
        )}
        <p className="text-sm italic text-muted-foreground">{lines.advice}</p>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Volver</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              // Stays open, and busy, until the answer comes back.
              event.preventDefault();
              save();
            }}
          >
            {busy ? "Guardando…" : "Guardar cambios"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
