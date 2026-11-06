"use client";

import { BellRingIcon, InfoIcon, Loader2Icon, SendIcon } from "lucide-react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  fetchReservationsOpenAudience,
  resendReservationsOpenNotice,
} from "@/app/lib/festivals/reservations-open-actions";
import type {
  ReservationsOpenAudience,
  ReservationsOpenNoticeSummary,
} from "@/app/lib/festivals/reservations-open-notices";
import { formatDisplayDate } from "@/app/lib/formatters";

function people(count: number, one: string, many: string) {
  return `${count.toLocaleString("es-BO")} ${count === 1 ? one : many}`;
}

type Props = {
  festivalId: number;
  /** Status allows a send: the festival is active. */
  active: boolean;
  archived: boolean;
  reservationsStartDate: Date;
  /** Read on the server, so the page renders the same on both sides. */
  reservationsOpen: boolean;
  notices: ReservationsOpenNoticeSummary[];
};

/**
 * The "reservations are open" notice: when it goes out on its own, what was
 * sent, and a button to send it again.
 */
export default function FestivalReservationsOpenCard({
  festivalId,
  active,
  archived,
  reservationsStartDate,
  reservationsOpen,
  notices,
}: Props) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [audience, setAudience] = useState<ReservationsOpenAudience | null>(
    null,
  );
  const [audienceError, setAudienceError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const opening = formatDisplayDate(
    reservationsStartDate,
    DateTime.DATETIME_MED,
  );
  const canSend = active && !archived && reservationsOpen;

  const status = archived
    ? "Este festival está archivado."
    : !active
      ? `Se enviará solo cuando el festival esté activo y abran las reservas (${opening}).`
      : !reservationsOpen
        ? `Se enviará automáticamente cuando abran las reservas, el ${opening}.`
        : notices.length === 0
          ? `Las reservas abrieron el ${opening}. Todavía no se envió ningún aviso: si abrieron hace menos de un día, sale solo en los próximos minutos.`
          : `Las reservas abrieron el ${opening}.`;

  async function openDialog() {
    // One id per dialog: a double click on "Enviar" is one send.
    setRequestId(crypto.randomUUID());
    setAudience(null);
    setAudienceError(null);
    setDialogOpen(true);
    const result = await fetchReservationsOpenAudience(festivalId);
    if (result.success) setAudience(result.audience);
    else setAudienceError(result.message);
  }

  async function send() {
    if (!requestId) return;
    setSending(true);
    try {
      const result = await resendReservationsOpenNotice({
        festivalId,
        requestId,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      if (result.alreadySent) {
        toast.info("Este aviso ya se había enviado.");
      } else {
        toast.success(
          `Aviso enviado a ${people(result.recipients, "participante", "participantes")}.`,
          {
            description:
              "Los correos y las notificaciones push salen en los próximos minutos.",
          },
        );
      }
      setDialogOpen(false);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BellRingIcon className="h-4 w-4" aria-hidden />
          Aviso de apertura de reservas
        </CardTitle>
        <CardDescription>
          Avisa a los participantes verificados que ya pueden reservar: por
          correo, en Glitter y con una notificación push en la app instalada.
          Sale solo cuando abren las reservas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {status}
        </p>

        {notices.length > 0 ? (
          <ul className="divide-y rounded-md border text-sm">
            {notices.map((notice) => (
              <li key={notice.campaignId} className="space-y-0.5 p-3">
                <p className="font-medium">
                  {notice.trigger === "automatic"
                    ? "Envío automático"
                    : `Reenviado${notice.sentByName ? ` por ${notice.sentByName}` : ""}`}
                  <span className="font-normal text-muted-foreground">
                    {" · "}
                    {formatDisplayDate(notice.createdAt, DateTime.DATETIME_MED)}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  {people(notice.recipients, "participante", "participantes")}
                  {" · "}
                  {notice.emailsSent.toLocaleString("es-BO")}/
                  {notice.emails.toLocaleString("es-BO")} correos
                  {" · "}
                  {notice.pushesSent.toLocaleString("es-BO")}/
                  {notice.pushes.toLocaleString("es-BO")} push
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canSend}
          onClick={openDialog}
        >
          <SendIcon className="mr-2 h-3.5 w-3.5" aria-hidden />
          {notices.length > 0 ? "Volver a enviar" : "Enviar ahora"}
        </Button>
      </CardContent>

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => !sending && setDialogOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {notices.length > 0
                ? "¿Volver a enviar el aviso?"
                : "¿Enviar el aviso ahora?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {audienceError ? (
                  <p className="text-destructive">{audienceError}</p>
                ) : audience ? (
                  <p>
                    Se enviará a{" "}
                    {people(
                      audience.recipients,
                      "participante verificado",
                      "participantes verificados",
                    )}{" "}
                    por correo y en Glitter.{" "}
                    {audience.withPush.toLocaleString("es-BO")} de ellos{" "}
                    {audience.withPush === 1 ? "tiene" : "tienen"} las
                    notificaciones push activadas y también lo recibirán en su
                    dispositivo.
                  </p>
                ) : (
                  <p className="flex items-center gap-2">
                    <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden />
                    Calculando destinatarios…
                  </p>
                )}
                {notices.length > 0 ? (
                  <p>
                    Quienes recibieron un aviso anterior lo recibirán de nuevo.
                  </p>
                ) : null}
                <p>
                  No se envía a quienes ya tienen una reserva en este festival.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              onClick={send}
              disabled={
                sending || !audience || audience.recipients === 0 || !requestId
              }
            >
              {sending ? (
                <Loader2Icon
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden
                />
              ) : null}
              Enviar aviso
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
