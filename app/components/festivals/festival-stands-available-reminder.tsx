"use client";

import { InfoIcon, Loader2Icon, SendIcon } from "lucide-react";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
  ChannelChoices,
  nextChannels,
} from "@/app/components/festivals/notice-channel-choices";
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
import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import {
  describeReservationsOpenChannels,
  type ReservationsOpenChannels,
  reservationsOpenChannelsProblem,
} from "@/app/lib/festivals/reservations-open-definitions";
import {
  fetchStandsAvailableAudience,
  sendStandsAvailableReminder,
} from "@/app/lib/festivals/stands-available-actions";
import type {
  StandsAvailableAudience,
  StandsAvailableAudienceCounts,
  StandsAvailableReminderSummary,
} from "@/app/lib/festivals/stands-available-reminders";
import { formatDisplayDate } from "@/app/lib/formatters";
import {
  STANDS_AVAILABLE_CATEGORIES,
  STANDS_AVAILABLE_CATEGORY_LABELS,
  type StandsAvailableCategory,
} from "@/app/lib/notifications/kinds/stands-available";

function people(count: number, one: string, many: string) {
  return `${count.toLocaleString("es-BO")} ${count === 1 ? one : many}`;
}

/** "a", "a y b", "a, b y c". */
function listJoin(parts: string[]) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

const AUDIENCE_LABELS: Record<StandsAvailableAudience, string> = {
  terms_accepted: "Quienes aceptaron los términos",
  all_eligible: "Todos los participantes verificados que pueden reservar",
};

type Props = {
  festivalId: number;
  active: boolean;
  archived: boolean;
  reservationsOpen: boolean;
  /** Stands anyone could still reserve, by category. */
  availableStands: Partial<Record<StandsAvailableCategory, number>>;
  /** The festival's saved channels, the dialog's starting point. */
  defaultChannels: ReservationsOpenChannels;
  reminders: StandsAvailableReminderSummary[];
};

/**
 * The "stands still available" reminder: what is left to reserve, what was
 * sent, and a button to send it. It only ever goes out by hand.
 */
export default function FestivalStandsAvailableReminder({
  festivalId,
  active,
  archived,
  reservationsOpen,
  availableStands,
  defaultChannels,
  reminders,
}: Props) {
  const router = useRouter();
  const radioId = useId();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [audience, setAudience] =
    useState<StandsAvailableAudience>("terms_accepted");
  const [channels, setChannels] = useState(defaultChannels);
  const [counts, setCounts] = useState<StandsAvailableAudienceCounts | null>(
    null,
  );
  const [countsError, setCountsError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  /** The dialog the counts are for; an older answer is dropped. */
  const currentDialog = useRef<string | null>(null);

  const available = STANDS_AVAILABLE_CATEGORIES.filter(
    (category) => (availableStands[category] ?? 0) > 0,
  );
  const totalAvailable = available.reduce(
    (sum, category) => sum + (availableStands[category] ?? 0),
    0,
  );
  const canSend =
    active && !archived && reservationsOpen && available.length > 0;
  const channelsProblem = reservationsOpenChannelsProblem(channels);
  const selected = counts?.[audience] ?? null;

  async function openDialog() {
    // One id per dialog: a double click on "Enviar" is one send.
    const id = crypto.randomUUID();
    currentDialog.current = id;
    setRequestId(id);
    setAudience("terms_accepted");
    setChannels(defaultChannels);
    setCounts(null);
    setCountsError(null);
    setDialogOpen(true);
    try {
      const result = await fetchStandsAvailableAudience(festivalId);
      // A dialog opened since answers for itself.
      if (currentDialog.current !== id) return;
      if (result.success) setCounts(result.audiences);
      else setCountsError(result.message);
    } catch {
      if (currentDialog.current !== id) return;
      setCountsError(
        "No se pudo calcular a quiénes se enviará el recordatorio.",
      );
    }
  }

  async function send() {
    if (!requestId) return;
    setSending(true);
    try {
      const result = await sendStandsAvailableReminder({
        festivalId,
        requestId,
        audience,
        channels,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      if (result.alreadySent) {
        toast.info("Este recordatorio ya se había enviado.");
      } else {
        toast.success(
          `Recordatorio enviado a ${people(result.recipients, "participante", "participantes")}.`,
          {
            description:
              "Los correos y las notificaciones push salen en los próximos minutos.",
          },
        );
      }
      setDialogOpen(false);
      router.refresh();
    } catch {
      toast.error("No se pudo enviar el recordatorio. Inténtalo nuevamente.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Recordatorios
      </h3>
      <div className="space-y-1">
        <p className="text-sm font-medium">
          Recordatorio de espacios disponibles
        </p>
        <p className="text-sm text-muted-foreground">
          Se envía solo a mano. Llega a quienes todavía tienen un espacio
          disponible para su categoría y no reservaron: los que aceptaron los
          términos y, si lo elegís, el resto de los participantes verificados
          que pueden reservar.
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {available.length > 0
          ? `${totalAvailable === 1 ? "Queda" : "Quedan"} ${listJoin(
              available.map((category, index) => {
                const count = availableStands[category] ?? 0;
                return `${index === 0 ? people(count, "espacio", "espacios") : count.toLocaleString("es-BO")} de ${STANDS_AVAILABLE_CATEGORY_LABELS[category]}`;
              }),
            )}.`
          : "No quedan espacios disponibles: no hay a quién recordarle."}
      </p>

      {reminders.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Recordatorios enviados</p>
          <ul className="divide-y rounded-md border text-sm">
            {reminders.map((reminder) => (
              <li key={reminder.campaignId} className="space-y-0.5 p-3">
                <p className="font-medium">
                  {reminder.sentByName
                    ? `Enviado por ${reminder.sentByName}`
                    : "Enviado"}
                  <span className="font-normal text-muted-foreground">
                    {" · "}
                    {formatDisplayDate(
                      reminder.createdAt,
                      DateTime.DATETIME_MED,
                    )}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  {AUDIENCE_LABELS[reminder.audience]}
                  {" · "}
                  {people(reminder.recipients, "participante", "participantes")}
                  {" por "}
                  {describeReservationsOpenChannels(reminder.channels)}
                  {reminder.channels.email
                    ? ` · ${reminder.emailsSent.toLocaleString("es-BO")}/${reminder.emails.toLocaleString("es-BO")} correos`
                    : ""}
                  {reminder.channels.push
                    ? ` · ${reminder.pushesSent.toLocaleString("es-BO")}/${reminder.pushes.toLocaleString("es-BO")} push`
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
          Enviar recordatorio
        </Button>
        {!canSend && !archived ? (
          <p className="text-xs text-muted-foreground">
            Se puede enviar con el festival activo, las reservas abiertas y
            espacios disponibles.
          </p>
        ) : null}
      </div>

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => !sending && setDialogOpen(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar el recordatorio?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Llega solo a quienes tienen un espacio disponible para su
                  categoría y todavía no reservaron. A cada persona se le nombra
                  su categoría.
                </p>
                {reminders.length > 0 ? (
                  <p>
                    Quienes recibieron un recordatorio antes lo recibirán de
                    nuevo.
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <p className="text-sm font-medium">Enviar a</p>
            {countsError ? (
              <p className="text-sm text-destructive">{countsError}</p>
            ) : null}
            <RadioGroup
              value={audience}
              onValueChange={(value) =>
                setAudience(value as StandsAvailableAudience)
              }
              disabled={sending}
            >
              {(["terms_accepted", "all_eligible"] as const).map((value) => (
                <div key={value} className="flex items-start gap-3">
                  <RadioGroupItem
                    value={value}
                    id={`${radioId}-${value}`}
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor={`${radioId}-${value}`}
                    className="text-sm font-normal"
                  >
                    {AUDIENCE_LABELS[value]}
                    {/* After a failed count, the error above says it all. */}
                    {countsError ? null : (
                      <span className="text-muted-foreground">
                        {" · "}
                        {counts ? (
                          people(
                            counts[value].recipients,
                            "persona",
                            "personas",
                          )
                        ) : (
                          <Loader2Icon
                            className="inline h-3.5 w-3.5 animate-spin"
                            aria-label="Calculando"
                          />
                        )}
                      </span>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Enviar por</p>
            <ChannelChoices
              channels={channels}
              disabled={sending}
              onChange={(key, checked) =>
                setChannels(nextChannels(channels, key, checked))
              }
            />
            {channelsProblem ? (
              <p className="text-xs text-destructive">{channelsProblem}</p>
            ) : selected && channels.push ? (
              <p className="text-xs text-muted-foreground">
                {selected.withPush.toLocaleString("es-BO")} de ellos{" "}
                {selected.withPush === 1 ? "tiene" : "tienen"} las
                notificaciones push activadas.
              </p>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              onClick={send}
              disabled={
                sending ||
                !selected ||
                selected.recipients === 0 ||
                !requestId ||
                channelsProblem !== null
              }
            >
              {sending ? (
                <Loader2Icon
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden
                />
              ) : null}
              Enviar recordatorio
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
