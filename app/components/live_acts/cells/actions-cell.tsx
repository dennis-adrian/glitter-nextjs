"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Textarea } from "@/app/components/ui/textarea";
import {
  updateLiveActAdminNotes,
  updateLiveActStatus,
} from "@/app/lib/live_acts/actions";
import { LiveAct } from "@/app/lib/live_acts/definitions";

export function LiveActActionsCell({ liveAct }: { liveAct: LiveAct }) {
  const router = useRouter();
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(liveAct.adminNotes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  async function handleStatusChange(
    status: "approved" | "backlog" | "rejected",
  ) {
    const res = await updateLiveActStatus(liveAct.id, status);
    if (res.success) {
      toast.success(res.message);
      router.refresh();
    } else {
      toast.error(res.message);
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    const res = await updateLiveActAdminNotes(liveAct.id, notes);
    setSavingNotes(false);
    if (res.success) {
      toast.success(res.message);
      setNotesOpen(false);
      router.refresh();
    } else {
      toast.error(res.message);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Abrir menú</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={liveAct.status === "approved"}
            asChild
          >
            <form
              className="w-full"
              action={() => handleStatusChange("approved")}
            >
              <button className="w-full text-left" type="submit">
                Aprobar
              </button>
            </form>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={liveAct.status === "backlog"}
            asChild
          >
            <form
              className="w-full"
              action={() => handleStatusChange("backlog")}
            >
              <button className="w-full text-left" type="submit">
                En lista de espera
              </button>
            </form>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={liveAct.status === "rejected"}
            asChild
          >
            <form
              className="w-full"
              action={() => handleStatusChange("rejected")}
            >
              <button className="w-full text-left" type="submit">
                Rechazar
              </button>
            </form>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setNotesOpen(true)}>
            {liveAct.adminNotes ? "Editar notas" : "Agregar notas"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notas — {liveAct.actName}</DialogTitle>
          </DialogHeader>
          <Textarea
            className="min-h-32 resize-none"
            placeholder="Notas internas sobre este acto..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNotesOpen(false)}
              disabled={savingNotes}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveNotes} disabled={savingNotes}>
              {savingNotes ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
