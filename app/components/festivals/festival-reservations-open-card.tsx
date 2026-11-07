"use client";

import { BellRingIcon, InfoIcon, Loader2Icon, SendIcon } from "lucide-react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
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
import { Checkbox } from "@/app/components/ui/checkbox";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import {
  fetchReservationsOpenAudience,
  resendReservationsOpenNotice,
  updateReservationsOpenNoticeSettings,
} from "@/app/lib/festivals/reservations-open-actions";
import {
  describeReservationsOpenChannels,
  type ReservationsOpenChannels,
  reservationsOpenChannelsProblem,
} from "@/app/lib/festivals/reservations-open-definitions";
import type {
  ReservationsOpenAudience,
  ReservationsOpenNoticeSummary,
} from "@/app/lib/festivals/reservations-open-notices";
import { formatDisplayDate } from "@/app/lib/formatters";
import { cn } from "@/app/lib/utils";

function people(count: number, one: string, many: string) {
  return `${count.toLocaleString("es-BO")} ${count === 1 ? one : many}`;
}

const CHANNEL_OPTIONS: {
  key: keyof ReservationsOpenChannels;
  label: string;
  description: string;
}[] = [
  {
    key: "email",
    label: "Correo electrónico",
    description:
      "No llega a quienes se dieron de baja de los avisos para participantes.",
  },
  {
    key: "inApp",
    label: "Notificación en Glitter",
    description: "Aparece en sus notificaciones dentro de Glitter.",
  },
  {
    key: "push",
    label: "Notificación push",
    description:
      "En los dispositivos con notificaciones activadas. Necesita la notificación en Glitter, que es la que abre.",
  },
];

/** Keeps the channels valid as one changes: push needs in-app. */
function nextChannels(
  channels: ReservationsOpenChannels,
  key: keyof ReservationsOpenChannels,
  checked: boolean,
): ReservationsOpenChannels {
  const next = { ...channels, [key]: checked };
  if (key === "inApp" && !checked) next.push = false;
  return next;
}

function ChannelChoices({
  channels,
  disabled,
  onChange,
}: {
  channels: ReservationsOpenChannels;
  disabled: boolean;
  onChange: (key: keyof ReservationsOpenChannels, checked: boolean) => void;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      {CHANNEL_OPTIONS.map((option) => {
        const optionId = `${id}-${option.key}`;
        const locked = option.key === "push" && !channels.inApp;
        return (
          <div key={option.key} className="flex items-start gap-3">
            <Checkbox
              id={optionId}
              checked={channels[option.key]}
              disabled={disabled || locked}
              onCheckedChange={(checked) =>
                onChange(option.key, checked === true)
              }
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label
                htmlFor={optionId}
                className={cn(
                  "text-sm font-medium",
                  (disabled || locked) && "text-muted-foreground",
                )}
              >
                {option.label}
              </Label>
              <p className="text-xs text-muted-foreground">
                {option.description}
              </p>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}

type Props = {
  festivalId: number;
  active: boolean;
  archived: boolean;
  reservationsStartDate: Date;
  /** Read on the server, so the page renders the same on both sides. */
  reservationsOpen: boolean;
  /** The opening is recent enough for the automatic notice to still go. */
  withinAutomaticWindow: boolean;
  settings: { auto: boolean; channels: ReservationsOpenChannels };
  notices: ReservationsOpenNoticeSummary[];
};

/**
 * Everything Glitter sends participants on its own for this festival, in
 * one place: the "reservations are open" notice, whether it goes out by
 * itself and how, what was sent, and a button to send it again.
 */
export default function FestivalReservationsOpenCard({
  festivalId,
  active,
  archived,
  reservationsStartDate,
  reservationsOpen,
  withinAutomaticWindow,
  settings: savedSettings,
  notices,
}: Props) {
  const router = useRouter();
  const switchId = useId();
  const [settings, setSettings] = useState(savedSettings);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [sendChannels, setSendChannels] = useState(savedSettings.channels);
  const [audience, setAudience] = useState<ReservationsOpenAudience | null>(
    null,
  );
  const [audienceError, setAudienceError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const opening = formatDisplayDate(
    reservationsStartDate,
    DateTime.DATETIME_MED,
  );
  const channelsText = describeReservationsOpenChannels(settings.channels);
  const notifiedThisOpening = notices.some(
    (notice) =>
      notice.reservationsStartDate.getTime() ===
      reservationsStartDate.getTime(),
  );
  const canSend = active && !archived && reservationsOpen;

  const status = archived
    ? "Este festival está archivado."
    : !settings.auto
      ? "El aviso automático está desactivado: no se envía nada por su cuenta. Podés enviarlo a mano cuando abran las reservas."
      : !reservationsOpen
        ? active
          ? `Se enviará automáticamente por ${channelsText} cuando abran las reservas, el ${opening}.`
          : `Se enviará automáticamente por ${channelsText} cuando abran las reservas (${opening}), si el festival está activo.`
        : notifiedThisOpening
          ? `Las reservas abrieron el ${opening} y el aviso ya se envió.`
          : active && withinAutomaticWindow
            ? `Las reservas abrieron el ${opening}. El aviso se enviará por ${channelsText} en los próximos minutos.`
            : `Las reservas abrieron el ${opening} y el aviso automático no se envió: solo sale dentro de la hora siguiente a la apertura, con el festival activo. Podés enviarlo a mano.`;

  async function save(next: typeof settings) {
    const previous = settings;
    setSettings(next);
    setSaving(true);
    try {
      const result = await updateReservationsOpenNoticeSettings({
        festivalId,
        auto: next.auto,
        channels: next.channels,
      });
      if (!result.success) {
        setSettings(previous);
        toast.error(result.message);
        return;
      }
      toast.success("Configuración guardada.");
      router.refresh();
    } catch {
      setSettings(previous);
      toast.error("No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  }

  async function openDialog() {
    // One id per dialog: a double click on "Enviar" is one send.
    setRequestId(crypto.randomUUID());
    setSendChannels(settings.channels);
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
        channels: sendChannels,
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

  const sendProblem = reservationsOpenChannelsProblem(sendChannels);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BellRingIcon className="h-4 w-4" aria-hidden />
          Notificaciones a participantes
        </CardTitle>
        <CardDescription>
          Lo que Glitter envía por su cuenta a los participantes de este
          festival.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <Label htmlFor={switchId} className="text-sm font-medium">
                Avisar cuando abren las reservas
              </Label>
              <p className="text-sm text-muted-foreground">
                Una sola vez, dentro de la hora siguiente a la apertura, a los
                participantes verificados de las categorías del festival que
                todavía no reservaron.
              </p>
            </div>
            <Switch
              id={switchId}
              checked={settings.auto}
              disabled={archived || saving}
              onCheckedChange={(checked) =>
                save({ ...settings, auto: checked })
              }
              className="mt-0.5 shrink-0"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Enviar por</p>
            <ChannelChoices
              channels={settings.channels}
              disabled={archived || saving}
              onChange={(key, checked) => {
                const channels = nextChannels(settings.channels, key, checked);
                const problem = reservationsOpenChannelsProblem(channels);
                if (problem) {
                  toast.error(problem);
                  return;
                }
                void save({ ...settings, channels });
              }}
            />
          </div>

          <p className="flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {status}
          </p>
        </div>

        {notices.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Envíos</p>
            <ul className="divide-y rounded-md border text-sm">
              {notices.map((notice) => (
                <li key={notice.campaignId} className="space-y-0.5 p-3">
                  <p className="font-medium">
                    {notice.trigger === "automatic"
                      ? "Envío automático"
                      : `Enviado a mano${notice.sentByName ? ` por ${notice.sentByName}` : ""}`}
                    <span className="font-normal text-muted-foreground">
                      {" · "}
                      {formatDisplayDate(
                        notice.createdAt,
                        DateTime.DATETIME_MED,
                      )}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    {people(notice.recipients, "participante", "participantes")}
                    {" por "}
                    {describeReservationsOpenChannels(notice.channels)}
                    {notice.channels.email
                      ? ` · ${notice.emailsSent.toLocaleString("es-BO")}/${notice.emails.toLocaleString("es-BO")} correos`
                      : ""}
                    {notice.channels.push
                      ? ` · ${notice.pushesSent.toLocaleString("es-BO")}/${notice.pushes.toLocaleString("es-BO")} push`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-1.5">
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
          {!canSend && !archived ? (
            <p className="text-xs text-muted-foreground">
              Se puede enviar a mano con el festival activo y las reservas
              abiertas.
            </p>
          ) : null}
        </div>
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
                    )}
                    .{" "}
                    {sendChannels.push
                      ? `${audience.withPush.toLocaleString("es-BO")} de ellos ${audience.withPush === 1 ? "tiene" : "tienen"} las notificaciones push activadas.`
                      : null}
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
          <div className="space-y-2">
            <p className="text-sm font-medium">Enviar por</p>
            <ChannelChoices
              channels={sendChannels}
              disabled={sending}
              onChange={(key, checked) =>
                setSendChannels(nextChannels(sendChannels, key, checked))
              }
            />
            {sendProblem ? (
              <p className="text-xs text-destructive">{sendProblem}</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              onClick={send}
              disabled={
                sending ||
                !audience ||
                audience.recipients === 0 ||
                !requestId ||
                sendProblem !== null
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
