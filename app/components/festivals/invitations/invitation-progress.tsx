"use client";

import {
  CheckCircle2Icon,
  CircleAlertIcon,
  Loader2Icon,
  RotateCwIcon,
} from "lucide-react";

import type { InvitationSendState } from "@/app/components/festivals/invitations/use-invitation-sender";
import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";

type InvitationProgressProps = {
  state: InvitationSendState;
  /** Recipients the audience count expected, for the progress bar. */
  expected: number;
  onRetry: () => void;
};

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString("es-BO")} ${count === 1 ? one : many}`;
}

/** Where a mailing run is, and what is left to do once it stops. */
export default function InvitationProgress({
  state,
  expected,
  onRetry,
}: InvitationProgressProps) {
  const processed = state.sent + state.failed;
  const value =
    state.status === "done"
      ? 100
      : expected > 0
        ? Math.min(99, Math.round((processed / expected) * 100))
        : 0;
  const pendingRetry = state.failures.length > 0;

  return (
    <div className="space-y-3" aria-live="polite">
      {state.status === "sending" ? (
        <>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden />
            Enviando invitaciones…
          </div>
          <Progress value={value} aria-label="Progreso del envío" />
          <p className="text-sm tabular-nums text-muted-foreground">
            {state.sent.toLocaleString("es-BO")} de{" "}
            {expected.toLocaleString("es-BO")} enviadas. No cierres esta
            ventana hasta que termine.
          </p>
        </>
      ) : null}

      {state.status === "done" && !pendingRetry ? (
        <div className="flex items-start gap-2 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">
          <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            {state.sent > 0
              ? `Listo: se ${state.sent === 1 ? "envió" : "enviaron"} ${plural(state.sent, "invitación", "invitaciones")}.`
              : "No había nadie a quien enviar la invitación."}
          </p>
        </div>
      ) : null}

      {(state.status === "done" || state.status === "error") &&
      pendingRetry ? (
        <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <CircleAlertIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium">
                {state.status === "error"
                  ? "El envío se detuvo antes de terminar."
                  : `No se pudieron enviar ${plural(state.failed, "invitación", "invitaciones")}.`}
              </p>
              <p>
                Se {state.sent === 1 ? "envió" : "enviaron"}{" "}
                {plural(state.sent, "invitación", "invitaciones")}.
                {state.message ? ` ${state.message}` : null}
                {state.status === "done" && state.failures[0]?.message
                  ? ` Resend respondió: ${state.failures[0].message}`
                  : null}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full bg-background sm:w-auto"
            onClick={onRetry}
          >
            <RotateCwIcon className="mr-2 h-4 w-4" aria-hidden />
            {state.status === "error"
              ? "Reanudar envío"
              : "Reintentar los que fallaron"}
          </Button>
        </div>
      ) : null}

      {state.simulated ? (
        <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          Este entorno no es producción: no se envió ningún correo real. Los
          números muestran lo que se habría enviado.
        </p>
      ) : null}

      {state.status !== "sending" && state.skipped > 0 ? (
        <p className="text-xs text-muted-foreground">
          Se omitieron{" "}
          {plural(state.skipped, "correo inválido o repetido", "correos inválidos o repetidos")}
          .
        </p>
      ) : null}
    </div>
  );
}
