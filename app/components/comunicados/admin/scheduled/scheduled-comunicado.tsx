"use client";

import {
  ArrowLeftIcon,
  CalendarClockIcon,
  CheckIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import PreviewPanel from "@/app/components/comunicados/admin/composer/preview-panel";
import DuplicateComunicadoButton from "@/app/components/comunicados/admin/duplicate-button";
import CancelScheduleButton from "@/app/components/comunicados/admin/scheduled/cancel-schedule-button";
import OverdueBanner from "@/app/components/comunicados/admin/scheduled/overdue-banner";
import SendConfirmDialog from "@/app/components/comunicados/admin/send-confirm-dialog";
import CreditGiftAutoRefresh from "@/app/components/credit_gifts/admin/credit-gift-auto-refresh";
import ScheduleDialog, {
  type ScheduleDialogResult,
} from "@/app/components/molecules/schedule-dialog";
import { Badge } from "@/app/components/ui/badge";
import { Banner } from "@/app/components/ui/banner";
import { Button, buttonVariants } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import type {
  ScheduleFailureCode,
  VercelEnvironment,
} from "@/app/lib/comunicados/contracts";
import { COMUNICADO_UNTITLED } from "@/app/lib/comunicados/definitions";
import { rescheduleComunicadoAction } from "@/app/lib/comunicados/schedule-actions";
import {
  SCHEDULE_DEVELOPMENT_REFUSAL,
  SCHEDULE_DIALOG_HINT,
  SCHEDULE_PREVIEW_NOTE,
  SCHEDULED_FROZEN_TEXT,
  scheduledForText,
  scheduleMomentLabel,
} from "@/app/lib/comunicados/schedule-copy";
import { scheduleAtProblem } from "@/app/lib/comunicados/schedule-rules";
import { confirmadosListName } from "@/app/lib/distribution_lists/definitions";
import { cn } from "@/app/lib/utils";

const COMUNICADOS_PATH = "/dashboard/communications";

/**
 * A change of date refused because the page no longer shows the comunicado
 * as it is: changed in another tab, already sending, or back to a draft.
 */
const OUT_OF_DATE = new Set<ScheduleFailureCode>([
  "STALE",
  "NOT_SCHEDULED",
  "NOT_FOUND",
]);

export type ScheduledComunicadoData = {
  id: number;
  version: number;
  title: string;
  doc: unknown[];
  actionLabel: string | null;
  actionPath: string | null;
  sendEmail: boolean;
  sendPush: boolean;
  essential: boolean;
  essentialReason: string | null;
  /** The festival an essential email names, as the preview shows it. */
  essentialFestivalName: string | null;
  /** ISO. */
  scheduledAt: string;
  scheduledByName: string | null;
};

/**
 * "Correo esencial · Confirmados · Glitter Navidad 2026 · «…»", the report's
 * essential block (G6) without who confirmed it, which the send records.
 */
function essentialLine(
  comunicado: Pick<
    ScheduledComunicadoData,
    "essentialFestivalName" | "essentialReason"
  >,
) {
  const parts = ["Correo esencial"];
  if (comunicado.essentialFestivalName) {
    parts.push(confirmadosListName(comunicado.essentialFestivalName));
  }
  if (comunicado.essentialReason) {
    parts.push(`«${comunicado.essentialReason}»`);
  }
  return parts.join(" · ");
}

function ChannelLine({ label, on }: { label: string; on: boolean }) {
  const Icon = on ? CheckIcon : XIcon;
  return (
    <li
      className={cn("flex items-center gap-2", !on && "text-muted-foreground")}
    >
      <Icon
        className={cn("h-4 w-4 shrink-0", on && "text-green-600")}
        aria-hidden
      />
      <span>{label}</span>
      <span className="sr-only">{on ? " (sí)" : " (no)"}</span>
    </li>
  );
}

/**
 * A scheduled comunicado's page (docs/IMPLEMENTATION-comunicados.md E1, E5,
 * E6, G6, D4): when it goes out and who scheduled it, its actions, and what
 * it says, read-only. It is frozen until it is sent or the schedule is
 * cancelled, so nothing here edits or saves: there is no editor and no
 * autosave, and nothing can race the release.
 */
export default function ScheduledComunicado({
  comunicado,
  audienceLabel,
  overdue,
  env,
}: {
  comunicado: ScheduledComunicadoData;
  /** "Para: Confirmados · Glitter Navidad 2026 y 3 personas", or null. */
  audienceLabel: string | null;
  /** Still scheduled 3 minutes past its time, by the server's clock (E6). */
  overdue: boolean;
  /** This server's own `VERCEL_ENV`. */
  env: VercelEnvironment;
}) {
  const router = useRouter();
  const developmentNoteId = useId();
  const [sendOpen, setSendOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const at = comunicado.scheduledAt;
  const title = comunicado.title.trim() || COMUNICADO_UNTITLED;
  // Nothing would release it there (E1); cancelling still works.
  const development = env === "development";

  async function reschedule(next: Date): Promise<ScheduleDialogResult> {
    const result = await rescheduleComunicadoAction({
      comunicadoId: comunicado.id,
      expectedVersion: comunicado.version,
      scheduledAt: next.toISOString(),
    });
    if (!result.success && OUT_OF_DATE.has(result.code)) {
      // As the confirm dialog does with a stale send: say it, and show the
      // comunicado as it is now (its report, or the draft's composer).
      setRescheduleOpen(false);
      toast.error(result.message);
      router.refresh();
    }
    return result;
  }

  return (
    <div className="space-y-4 overflow-y-auto pb-6">
      <Link
        href={COMUNICADOS_PATH}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-3",
        )}
      >
        <ArrowLeftIcon className="mr-1 h-4 w-4" aria-hidden />
        Comunicados
      </Link>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 break-words text-lg font-semibold">
              {title}
            </h2>
            <Badge variant="secondary">
              {`Programado · ${scheduleMomentLabel(at)}`}
            </Badge>
            {comunicado.essential && <Badge variant="orange">Esencial</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {scheduledForText(at)}
            {comunicado.scheduledByName &&
              ` · lo programó ${comunicado.scheduledByName}`}
          </p>
          {env === "preview" && (
            <p className="text-sm text-muted-foreground">
              {SCHEDULE_PREVIEW_NOTE}
            </p>
          )}
        </div>
        <div className="space-y-1 lg:shrink-0">
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button type="button" onClick={() => setSendOpen(true)}>
              <SendIcon className="mr-2 h-4 w-4" aria-hidden />
              Enviar ahora
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={development}
              aria-describedby={development ? developmentNoteId : undefined}
              onClick={() => setRescheduleOpen(true)}
            >
              <CalendarClockIcon className="mr-2 h-4 w-4" aria-hidden />
              Cambiar fecha
            </Button>
            <CancelScheduleButton comunicadoId={comunicado.id} />
            <DuplicateComunicadoButton
              comunicadoId={comunicado.id}
              variant="outline"
            />
          </div>
          {development && (
            <p
              id={developmentNoteId}
              className="text-xs text-muted-foreground lg:text-right"
            >
              {SCHEDULE_DEVELOPMENT_REFUSAL}
            </p>
          )}
        </div>
      </div>

      <Banner variant="info">{SCHEDULED_FROZEN_TEXT}</Banner>
      {overdue && (
        <OverdueBanner
          comunicadoId={comunicado.id}
          version={comunicado.version}
          scheduledAt={at}
          env={env}
        />
      )}
      {/* Overdue, the release may come any moment: the page follows it. */}
      <CreditGiftAutoRefresh active={overdue} />

      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Destinatarios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="break-words text-sm">
                {audienceLabel ?? "Sin destinatarios"}
              </p>
              <p className="text-xs text-muted-foreground">
                La audiencia se calcula al momento del envío.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Canales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2 text-sm" aria-label="Canales">
                <ChannelLine label="En la app" on />
                <ChannelLine label="Por correo" on={comunicado.sendEmail} />
                <ChannelLine
                  label="En el dispositivo"
                  on={comunicado.sendPush}
                />
              </ul>
              {comunicado.essential && (
                <p className="break-words border-t pt-3 text-sm">
                  {essentialLine(comunicado)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="min-w-0">
          <PreviewPanel
            input={{
              title: comunicado.title,
              doc: comunicado.doc,
              actionLabel: comunicado.actionLabel,
              actionPath: comunicado.actionPath,
              essentialFestivalName: comunicado.essentialFestivalName,
            }}
            sendPush={comunicado.sendPush}
          />
        </div>
      </div>

      <SendConfirmDialog
        comunicadoId={comunicado.id}
        open={sendOpen}
        onOpenChange={setSendOpen}
        knownVersion={comunicado.version}
        // Frozen: there is no autosave to pause (E1).
        onBeforeSend={async () => () => {}}
        onSent={() => router.refresh()}
      />
      <ScheduleDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        title="Cambiar fecha"
        description={SCHEDULE_DIALOG_HINT}
        hint={env === "preview" ? SCHEDULE_PREVIEW_NOTE : undefined}
        currentScheduledAt={new Date(at)}
        confirmLabel="Guardar fecha"
        pendingLabel="Guardando…"
        validate={(next) => scheduleAtProblem(next, Date.now())}
        onConfirm={reschedule}
      />
    </div>
  );
}
