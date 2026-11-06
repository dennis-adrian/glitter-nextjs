"use client";

import type { ReactNode } from "react";

import CreditGiftLengthCounter from "@/app/components/credit_gifts/admin/credit-gift-length-counter";
import {
  emailChannelLine,
  ESSENTIAL_RULE_LINE,
  essentialHelpText,
  PUSH_NOT_LAUNCHED_LINE,
  pushChannelLine,
} from "@/app/components/comunicados/admin/composer/composer-copy";
import { Banner } from "@/app/components/ui/banner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import { Textarea } from "@/app/components/ui/textarea";
import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";
import {
  COMUNICADO_ESSENTIAL_REASON_MAX,
  COMUNICADO_ESSENTIAL_REASON_MIN,
} from "@/app/lib/comunicados/definitions";

type ChannelsCardProps = {
  sendEmail: boolean;
  onSendEmailChange: (sendEmail: boolean) => void;
  sendPush: boolean;
  onSendPushChange: (sendPush: boolean) => void;
  essential: boolean;
  onEssentialChange: (essential: boolean) => void;
  essentialReason: string;
  onEssentialReasonChange: (reason: string) => void;
  /** Null while there is no audience, or before the first count. */
  preview: ComunicadoAudiencePreview | null;
  /** Whether `push_notifications` is public for participants. */
  pushLaunched: boolean;
  disabled?: boolean;
};

/**
 * Whether "Correo esencial" can be turned on: only for the audience B7
 * allows, with email ticked. Once on it can always be turned off, and it is
 * never turned off for the admin: a draft keeps what they chose, and the send
 * refuses it if the audience no longer allows it.
 */
export function essentialSwitchState({
  essential,
  sendEmail,
  preview,
}: {
  essential: boolean;
  sendEmail: boolean;
  preview: ComunicadoAudiencePreview | null;
}) {
  const allowed = Boolean(preview?.essentialAllowed.ok) && sendEmail;
  return {
    allowed,
    canToggle: essential || allowed,
    /** Shown while it is on but the audience no longer allows it. */
    notAllowedReason:
      essential && !allowed
        ? (preview?.essentialAllowed.reason ?? ESSENTIAL_RULE_LINE)
        : null,
  };
}

/**
 * "Canales" (docs/IMPLEMENTATION-comunicados.md G4, B7): the inbox always,
 * email unless unticked, the device only when ticked, and the essential
 * email for the one case it is allowed.
 */
export default function ChannelsCard({
  sendEmail,
  onSendEmailChange,
  sendPush,
  onSendPushChange,
  essential,
  onEssentialChange,
  essentialReason,
  onEssentialReasonChange,
  preview,
  pushLaunched,
  disabled = false,
}: ChannelsCardProps) {
  const essentialState = essentialSwitchState({
    essential,
    sendEmail,
    preview,
  });
  const festivalName = preview?.essentialAllowed.festival?.name ?? null;
  const reasonLength = essentialReason.trim().length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Canales</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <ChannelRow
          id="comunicado-channel-app"
          label="En la app"
          checked
          disabled
          description="Siempre: queda en sus notificaciones de Glitter."
        />

        <ChannelRow
          id="comunicado-channel-email"
          label="Por correo"
          checked={sendEmail}
          disabled={disabled}
          onCheckedChange={onSendEmailChange}
          description={
            preview
              ? emailChannelLine(preview)
              : "Elegí destinatarios para ver a cuántos les llega."
          }
        />

        <ChannelRow
          id="comunicado-channel-push"
          label="Notificación en el dispositivo"
          checked={sendPush}
          disabled={disabled}
          onCheckedChange={onSendPushChange}
          description={
            <>
              <span className="block">
                {pushChannelLine(preview ? preview.pushDevices : null)}
              </span>
              {!pushLaunched && (
                <span className="mt-1 block">{PUSH_NOT_LAUNCHED_LINE}</span>
              )}
            </>
          }
        />

        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-3">
            <Switch
              id="comunicado-essential"
              checked={essential}
              disabled={disabled || !essentialState.canToggle}
              onCheckedChange={onEssentialChange}
              aria-describedby="comunicado-essential-help"
            />
            <Label htmlFor="comunicado-essential">Correo esencial</Label>
          </div>
          {essentialState.notAllowedReason ? (
            <Banner variant="warning">
              <span id="comunicado-essential-help">
                {essentialState.notAllowedReason} Desmarcalo o cambiá los
                destinatarios para poder enviarlo.
              </span>
            </Banner>
          ) : (
            <p
              id="comunicado-essential-help"
              className="text-xs text-muted-foreground"
            >
              {essentialState.allowed && preview && festivalName
                ? essentialHelpText(preview, festivalName)
                : ESSENTIAL_RULE_LINE}
            </p>
          )}
          {essential && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="comunicado-essential-reason">
                  ¿Por qué es esencial?
                </Label>
                <CreditGiftLengthCounter
                  length={essentialReason.length}
                  max={COMUNICADO_ESSENTIAL_REASON_MAX}
                />
              </div>
              <Textarea
                id="comunicado-essential-reason"
                value={essentialReason}
                maxLength={COMUNICADO_ESSENTIAL_REASON_MAX}
                rows={2}
                disabled={disabled}
                onChange={(event) =>
                  onEssentialReasonChange(event.target.value)
                }
                aria-describedby="comunicado-essential-reason-hint"
              />
              <p
                id="comunicado-essential-reason-hint"
                className="text-xs text-muted-foreground"
              >
                Solo lo ve el equipo.
                {reasonLength > 0 &&
                  reasonLength < COMUNICADO_ESSENTIAL_REASON_MIN &&
                  ` Escribí al menos ${COMUNICADO_ESSENTIAL_REASON_MIN} caracteres.`}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChannelRow({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
  description,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  description: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange?.(value === true)}
        aria-describedby={`${id}-description`}
        className="mt-0.5"
      />
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
