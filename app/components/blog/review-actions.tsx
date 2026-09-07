"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Textarea } from "@/app/components/ui/textarea";
import {
  approveAndPublish,
  rejectPost,
  requestChanges,
} from "@/app/lib/posts/actions";

type Props = {
  postId: number;
};

export default function ReviewActions({ postId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [changesNotes, setChangesNotes] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");
  const [changesOpen, setChangesOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  async function handleApprove() {
    setBusy(true);
    try {
      const res = await approveAndPublish(postId);
      if (res.success) {
        toast.success("Artículo publicado");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestChanges() {
    setBusy(true);
    try {
      const res = await requestChanges(postId, { notes: changesNotes });
      if (res.success) {
        toast.success("Cambios solicitados al autor");
        setChangesOpen(false);
        setChangesNotes("");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    try {
      const res = await rejectPost(postId, { notes: rejectNotes });
      if (res.success) {
        toast.success("Artículo rechazado");
        setRejectOpen(false);
        setRejectNotes("");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        className="bg-emerald-600 hover:bg-emerald-700"
        disabled={busy}
        onClick={handleApprove}
      >
        Aprobar y publicar
      </Button>

      <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            Solicitar cambios
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar cambios</DialogTitle>
            <DialogDescription>
              El artículo regresará al autor como borrador con tus notas.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={changesNotes}
            onChange={(e) => setChangesNotes(e.target.value)}
            placeholder="Detalla los cambios solicitados…"
            rows={5}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancelar</Button>
            </DialogClose>
            <Button
              onClick={handleRequestChanges}
              disabled={busy || changesNotes.trim().length < 10}
            >
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="destructive" disabled={busy}>
            Rechazar
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar artículo</DialogTitle>
            <DialogDescription>
              Esta acción finaliza la revisión. El autor verá tus notas.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Motivo del rechazo…"
            rows={5}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={busy || rejectNotes.trim().length < 10}
            >
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
