"use client";

import { MailIcon, UsersIcon } from "lucide-react";

import {
  type ComposerEnv,
  VISITOR_TOO_LARGE_TEXT,
  VISITORS_EMAIL_ONLY_TEXT,
  visitorReachText,
} from "@/app/components/comunicados/admin/composer/composer-copy";
import { Banner } from "@/app/components/ui/banner";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";
import {
  COMUNICADO_CONTACTS_SOURCE_LABEL,
  type ComunicadoAudienceKind,
} from "@/app/lib/comunicados/definitions";
import { formatAudienceCount } from "@/app/lib/distribution_lists/definitions";

/**
 * "¿Para quién es?" (§L): participants with an account, or visitors and
 * guest merch buyers, never both. Switching keeps the participant lists and
 * people as they were.
 */
export function AudienceKindCard({
  kind,
  onChange,
  disabled = false,
}: {
  kind: ComunicadoAudienceKind;
  onChange: (kind: ComunicadoAudienceKind) => void;
  disabled?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">¿Para quién es?</CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={kind}
          onValueChange={(value) => onChange(value as ComunicadoAudienceKind)}
          disabled={disabled}
          className="gap-3 sm:grid-cols-2"
          aria-label="Para quién es"
        >
          <Label
            htmlFor="audience-kind-users"
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary"
          >
            <RadioGroupItem id="audience-kind-users" value="users" />
            <span className="space-y-1">
              <span className="flex items-center gap-2 font-medium">
                <UsersIcon className="h-4 w-4" aria-hidden />
                Participantes
              </span>
              <span className="block text-sm text-muted-foreground">
                Cuentas de Glitter: bandeja de la app, correo y notificación.
              </span>
            </span>
          </Label>
          <Label
            htmlFor="audience-kind-visitors"
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[[data-state=checked]]:border-primary"
          >
            <RadioGroupItem id="audience-kind-visitors" value="visitors" />
            <span className="space-y-1">
              <span className="flex items-center gap-2 font-medium">
                <MailIcon className="h-4 w-4" aria-hidden />
                Visitantes y compradores
              </span>
              <span className="block text-sm text-muted-foreground">
                Sin cuenta: solo por correo, como «Novedades».
              </span>
            </span>
          </Label>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}

/**
 * The audience of a comunicado to visitors (§L): every festival's visitors
 * and every guest merch buyer, once per address, with today's count and why
 * the rest do not get it. Email only, said up front.
 */
export function VisitorAudienceCard({
  preview,
  previewError,
  onRetryPreview,
  env,
}: {
  preview: ComunicadoAudiencePreview | null;
  previewError: string | null;
  onRetryPreview: () => void;
  env: ComposerEnv;
}) {
  // Before narrowing: the preview's own skip is not a reason anyone has.
  const skipped = preview ? preview.matched - preview.eligible : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Destinatarios y canal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Banner variant="info">{VISITORS_EMAIL_ONLY_TEXT}</Banner>
        <div className="rounded-lg border px-3 py-2">
          <p className="text-sm font-medium">
            {COMUNICADO_CONTACTS_SOURCE_LABEL}
          </p>
          <p className="text-sm text-muted-foreground">
            Todos los festivales, una vez por dirección de correo.
          </p>
          {preview ? (
            <p className="mt-1 text-sm">
              Pueden recibirlo hoy: {formatAudienceCount(preview.eligible)}
              {skipped > 0
                ? ` · ${formatAudienceCount(skipped)} no lo reciben`
                : ""}
            </p>
          ) : previewError ? (
            <div className="mt-1 flex items-center gap-2 text-sm text-destructive">
              {previewError}
              <Button size="sm" variant="outline" onClick={onRetryPreview}>
                Reintentar
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Contando…</p>
          )}
        </div>
        {preview && preview.skipped.length > 0 && (
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {preview.skipped.map((entry) => (
              <li key={entry.reason}>
                {entry.reason}: {formatAudienceCount(entry.count)}
              </li>
            ))}
          </ul>
        )}
        {preview && <p className="text-sm">{visitorReachText(preview, env)}</p>}
        {preview?.tooLarge && (
          <Banner variant="warning">{VISITOR_TOO_LARGE_TEXT}</Banner>
        )}
        <p className="text-xs text-muted-foreground">
          Quienes se registraron o compraron sin marcar «Quiero recibir
          novedades» no lo reciben; los contactos de antes de esa casilla sí.
        </p>
      </CardContent>
    </Card>
  );
}
