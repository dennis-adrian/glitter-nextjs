"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  culturalActivityCategoryLabel,
  LiveAct,
} from "@/app/lib/live_acts/definitions";
import { formatDisplayDate } from "@/app/lib/formatters";
import { toastActionError } from "@/app/lib/errors/action-error";

export function LiveActActionsCell({ liveAct }: { liveAct: LiveAct }) {
  const router = useRouter();
  const [notesOpen, setNotesOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [notes, setNotes] = useState(liveAct.adminNotes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  async function handleStatusChange(
    status: "approved" | "backlog" | "rejected",
  ) {
    setSavingStatus(true);
    try {
      const res = await updateLiveActStatus(liveAct.id, status);
      if (res.success) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toastActionError(err, "Error al actualizar el estado");
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      const res = await updateLiveActAdminNotes(liveAct.id, notes);
      if (res.success) {
        toast.success(res.message);
        setNotesOpen(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toastActionError(err, "Error al guardar las notas");
    } finally {
      setSavingNotes(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            disabled={savingStatus}
          >
            <span className="sr-only">Abrir menú</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>
            Ver detalles
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={liveAct.status === "approved" || savingStatus}
            asChild
          >
            <form
              className="w-full"
              action={() => handleStatusChange("approved")}
            >
              <button
                className="w-full text-left"
                type="submit"
                disabled={liveAct.status === "approved" || savingStatus}
              >
                Aprobar
              </button>
            </form>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={liveAct.status === "backlog" || savingStatus}
            asChild
          >
            <form
              className="w-full"
              action={() => handleStatusChange("backlog")}
            >
              <button
                className="w-full text-left"
                type="submit"
                disabled={liveAct.status === "backlog" || savingStatus}
              >
                En lista de espera
              </button>
            </form>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={liveAct.status === "rejected" || savingStatus}
            asChild
          >
            <form
              className="w-full"
              action={() => handleStatusChange("rejected")}
            >
              <button
                className="w-full text-left"
                type="submit"
                disabled={liveAct.status === "rejected" || savingStatus}
              >
                Rechazar
              </button>
            </form>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={savingStatus}
            onSelect={() => {
              setNotes(liveAct.adminNotes ?? "");
              setNotesOpen(true);
            }}
          >
            {liveAct.adminNotes ? "Editar notas" : "Agregar notas"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="break-words">{liveAct.actName}</DialogTitle>
            <DialogDescription className="break-words">
              {culturalActivityCategoryLabel(
                liveAct.category,
                liveAct.otherType,
              )}
            </DialogDescription>
          </DialogHeader>
          <LiveActDetails liveAct={liveAct} />
        </DialogContent>
      </Dialog>

      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notas — {liveAct.actName}</DialogTitle>
          </DialogHeader>
          <Textarea
            className="min-h-32 resize-none"
            placeholder="Notas internas sobre esta actividad..."
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

function LiveActDetails({ liveAct }: { liveAct: LiveAct }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Descripción", value: liveAct.description },
    {
      label: "Enlace de referencia",
      value: liveAct.resourceLink ? (
        <ExternalLink href={liveAct.resourceLink} />
      ) : null,
    },
    {
      label: "Redes / sitio web",
      value:
        liveAct.socialLinks && liveAct.socialLinks.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {liveAct.socialLinks.map((link) => (
              <li key={link}>
                <ExternalLink href={link} />
              </li>
            ))}
          </ul>
        ) : null,
    },
    {
      label: "Cupo de participantes",
      value: liveAct.workshopCapacity?.toString(),
    },
    { label: "Necesita", value: liveAct.spaceNeeds },
    { label: "Curso o programa relacionado", value: liveAct.relatedOffer },
    {
      label: "Sin costo para participantes",
      value: liveAct.noCostAcknowledgedAt
        ? `Aceptado el ${formatDisplayDate(new Date(liveAct.noCostAcknowledgedAt))}`
        : null,
    },
    {
      label: "Contacto",
      value: (
        <span className="flex flex-col">
          <span className="break-words">{liveAct.contactName}</span>
          <span className="wrap-anywhere">{liveAct.contactEmail}</span>
          <span>{liveAct.contactPhone}</span>
        </span>
      ),
    },
    { label: "Notas internas", value: liveAct.adminNotes },
  ];
  return (
    <dl className="grid gap-3 text-sm">
      {rows
        .filter((row) => row.value)
        .map((row) => (
          <div key={row.label} className="grid min-w-0 gap-0.5">
            <dt className="font-medium text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 break-words whitespace-pre-line">
              {row.value}
            </dd>
          </div>
        ))}
    </dl>
  );
}

function ExternalLink({ href }: { href: string }) {
  const isHttp = href.startsWith("http://") || href.startsWith("https://");
  if (!isHttp) return <span className="wrap-anywhere">{href}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 wrap-anywhere hover:underline dark:text-blue-400"
    >
      {href}
    </a>
  );
}
