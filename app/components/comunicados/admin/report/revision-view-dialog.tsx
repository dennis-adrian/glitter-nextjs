"use client";

import { EyeIcon } from "lucide-react";
import { useState } from "react";

import RichTextHtml from "@/app/components/molecules/rich-text-html";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Skeleton } from "@/app/components/ui/skeleton";
import type { ComunicadoRevisionView } from "@/app/lib/comunicados/contracts";
import { loadComunicadoRevisionAction } from "@/app/lib/comunicados/revision-actions";

type ViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; view: ComunicadoRevisionView }
  | { status: "error"; message: string };

/**
 * "Ver" on a row of "Historial" (docs/IMPLEMENTATION-comunicados.md G6): that
 * version rendered, with its button. It is read the first time it opens; a
 * version never changes, so later openings show what was read, and only a
 * failed read is tried again.
 */
export default function RevisionViewButton({
  comunicadoId,
  revision,
  title,
  line,
}: {
  comunicadoId: number;
  revision: number;
  title: string;
  /** Its row in the history, already written: who, when and the note. */
  line: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ViewState>({ status: "idle" });

  function show() {
    setOpen(true);
    if (state.status === "loading" || state.status === "ready") return;
    setState({ status: "loading" });
    loadComunicadoRevisionAction({ comunicadoId, revision })
      .then((result) =>
        setState(
          result.success
            ? { status: "ready", view: result.revision }
            : { status: "error", message: result.message },
        ),
      )
      .catch((error: unknown) => {
        console.error("Error loading a comunicado's revision", error);
        setState({
          status: "error",
          message: "No pudimos cargar esta versión. Probá de nuevo.",
        });
      });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={show}
        aria-label={`Ver la versión ${revision}`}
      >
        <EyeIcon className="mr-1 h-4 w-4" aria-hidden />
        Ver
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          hideCloseButton
          className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle className="break-words leading-snug">
              Versión {revision} · «{title}»
            </DialogTitle>
            <DialogDescription>{line}</DialogDescription>
          </DialogHeader>

          {state.status === "ready" ? (
            <div className="space-y-3">
              <RichTextHtml html={state.view.html} className="text-base" />
              {state.view.actionLabel && state.view.actionPath && (
                <p className="break-words text-sm text-muted-foreground">
                  Botón: {state.view.actionLabel} (lleva a{" "}
                  {state.view.actionPath})
                </p>
              )}
            </div>
          ) : state.status === "error" ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {state.message}
            </p>
          ) : (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="sm:self-end">
                Cerrar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
