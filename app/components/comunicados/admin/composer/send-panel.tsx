"use client";

import { CalendarClockIcon, FlaskConicalIcon, SendIcon } from "lucide-react";
import { useId } from "react";

import {
  IMAGE_UPLOADING_TEXT,
  realSkippedCount,
} from "@/app/components/comunicados/admin/composer/composer-copy";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";
import { formatAudienceCount } from "@/app/lib/distribution_lists/definitions";

type SendPanelProps = {
  preview: ComunicadoAudiencePreview | null;
  /** No audience yet: every count is zero, nothing to wait for. */
  audienceEmpty: boolean;
  sendEmail: boolean;
  sendPush: boolean;
  /** What a send would still need, as "un título", "el texto"… */
  missing: string[];
  onTestSend: () => void;
  testPending: boolean;
  /** "Enviar…": saves what is on screen, then opens the confirm dialog. */
  onSend: () => void;
  /** Saving before the dialog, or the dialog is open. */
  sendPending: boolean;
  /** "Programar…": the same, with the dialog picking a time. */
  onSchedule: () => void;
  schedulePending: boolean;
  /** Why nothing can be scheduled here at all, shown under the button. */
  scheduleDisabledReason: string | null;
  /** An image is still uploading: what is sent now would go without it. */
  uploading?: boolean;
  disabled?: boolean;
};

/**
 * "Enviar" (docs/IMPLEMENTATION-comunicados.md G4, G5, D11, E5): today's
 * numbers, a test of the saved draft to the admin, and "Programar…" and
 * "Enviar…", which confirm the schedule or the send in a dialog.
 */
export default function SendPanel({
  preview,
  audienceEmpty,
  sendEmail,
  sendPush,
  missing,
  onTestSend,
  testPending,
  onSend,
  sendPending,
  onSchedule,
  schedulePending,
  scheduleDisabledReason,
  uploading = false,
  disabled = false,
}: SendPanelProps) {
  const scheduleReasonId = useId();
  const count = (value: number | undefined) =>
    audienceEmpty
      ? "0"
      : value === undefined
        ? "—"
        : formatAudienceCount(value);
  // Nothing the dialog could send or schedule: it would only refuse. One
  // dialog at a time.
  const sendDisabled =
    disabled ||
    uploading ||
    sendPending ||
    schedulePending ||
    missing.length > 0 ||
    audienceEmpty ||
    preview?.tooLarge === true;
  const scheduleDisabled = sendDisabled || scheduleDisabledReason !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Enviar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Personas</dt>
          <dd className="text-right tabular-nums">
            {count(preview?.eligible)}
          </dd>
          {preview?.narrowed && (
            <>
              <dt className="text-muted-foreground">
                Lo reciben en este entorno
              </dt>
              <dd className="text-right tabular-nums">
                {count(preview.willReceive)}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">Por correo</dt>
          <dd className="text-right tabular-nums">
            {sendEmail ? count(preview?.email.sendTo) : "No"}
          </dd>
          <dt className="text-muted-foreground">En el dispositivo</dt>
          <dd className="text-right tabular-nums">
            {sendPush ? count(preview?.pushDevices) : "No"}
          </dd>
          <dt className="text-muted-foreground">No lo reciben</dt>
          <dd className="text-right tabular-nums">
            {count(preview ? realSkippedCount(preview) : undefined)}
          </dd>
        </dl>

        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={disabled || uploading || testPending}
          onClick={onTestSend}
        >
          <FlaskConicalIcon className="mr-2 h-4 w-4" aria-hidden />
          {testPending ? "Enviando la prueba…" : "Enviarme una prueba"}
        </Button>
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={scheduleDisabled}
            onClick={onSchedule}
            aria-describedby={
              scheduleDisabledReason ? scheduleReasonId : undefined
            }
          >
            <CalendarClockIcon className="mr-2 h-4 w-4" aria-hidden />
            Programar…
          </Button>
          {scheduleDisabledReason && (
            <p id={scheduleReasonId} className="text-xs text-muted-foreground">
              {scheduleDisabledReason}
            </p>
          )}
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={sendDisabled}
          onClick={onSend}
        >
          <SendIcon className="mr-2 h-4 w-4" aria-hidden />
          Enviar…
        </Button>
        {missing.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Falta {missing.join(", ")}.
          </p>
        )}
        {uploading && (
          <p className="text-xs text-muted-foreground">
            {IMAGE_UPLOADING_TEXT}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
