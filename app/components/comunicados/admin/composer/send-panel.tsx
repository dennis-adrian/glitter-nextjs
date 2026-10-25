"use client";

import { FlaskConicalIcon } from "lucide-react";

import { realSkippedCount } from "@/app/components/comunicados/admin/composer/composer-copy";
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
  disabled?: boolean;
};

/**
 * "Enviar" (docs/IMPLEMENTATION-comunicados.md G4, D11). Sending and
 * scheduling arrive in the next release; for now the admin can mail
 * themselves a test of the saved draft.
 */
export default function SendPanel({
  preview,
  audienceEmpty,
  sendEmail,
  sendPush,
  missing,
  onTestSend,
  testPending,
  disabled = false,
}: SendPanelProps) {
  const count = (value: number | undefined) =>
    audienceEmpty
      ? "0"
      : value === undefined
        ? "—"
        : formatAudienceCount(value);

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
          disabled={disabled || testPending}
          onClick={onTestSend}
        >
          <FlaskConicalIcon className="mr-2 h-4 w-4" aria-hidden />
          {testPending ? "Enviando la prueba…" : "Enviarme una prueba"}
        </Button>
        {missing.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Falta {missing.join(", ")}.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Programar y enviar llegan en la próxima versión.
        </p>
      </CardContent>
    </Card>
  );
}
