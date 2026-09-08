"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { requestChanges } from "@/app/lib/posts/actions";

type Props = {
  postId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

export default function RequestChangesDialog({
  postId,
  open,
  onOpenChange,
  onDone,
}: Props) {
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        const res = await requestChanges(postId, { notes });
        if (!res.success) {
          toast.error(res.message);
          return;
        }
        toast.success("Se enviaron los comentarios al autor");
        onOpenChange(false);
        setNotes("");
        onDone?.();
      } catch {
        // The action returns { success: false } for anything it can foresee, so
        // a rejection is the transport failing. The dialog stays open with the
        // notes intact, otherwise the review feedback is lost to a retry.
        toast.error("No se pudieron enviar los comentarios. Intentá de nuevo.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar cambios al autor</DialogTitle>
          <DialogDescription>
            Explícale al autor qué hace falta ajustar antes de aprobar la
            publicación.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Por ejemplo: corregir los títulos de las secciones, agregar imagen de portada, revisar la cita en el segundo párrafo…"
          rows={6}
          maxLength={2000}
          disabled={isPending}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={isPending || notes.trim().length < 10}
          >
            Enviar comentarios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
