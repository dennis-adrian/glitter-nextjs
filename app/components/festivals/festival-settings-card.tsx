"use client";

import { ExternalLinkIcon, InfoIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import FestivalSettingDialog, {
  type FestivalSettingInvitation,
} from "@/app/components/festivals/modals/festival-setting-dialog";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import {
  setFestivalActive,
  updateFestivalEventDayRegistration,
  updateFestivalParticipantTerms,
  updateFestivalRegistration,
} from "@/app/lib/festivals/actions";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import type { InvitationAudience } from "@/app/lib/festivals/invitation-definitions";
import { formatDisplayDate } from "@/app/lib/formatters";
import { cn } from "@/app/lib/utils";
import { DateTime } from "luxon";

/**
 * What the admin asked for, captured when the dialog opens. The festival
 * prop changes under the dialog as soon as the switch is saved, and the
 * dialog must keep describing the change that was made, not the next one.
 */
type DialogIntent =
  | { type: "status"; enable: boolean }
  | { type: "registration"; enable: boolean }
  | { type: "invite-visitors" }
  | { type: "event-day"; enable: boolean }
  | { type: "terms"; enable: boolean };

function people(count: number, one: string, many: string) {
  return `${count.toLocaleString("es-BO")} ${count === 1 ? one : many}`;
}

function visitorAudienceNote(audience: InvitationAudience) {
  const parts = [
    audience.alreadyRegistered > 0
      ? `${people(audience.alreadyRegistered, "visitante ya tiene", "visitantes ya tienen")} entrada`
      : null,
    audience.invalidEmails > 0
      ? `${people(audience.invalidEmails, "correo no es válido", "correos no son válidos")}`
      : null,
  ].filter(Boolean);
  return parts.length > 0
    ? `No se envía a quienes ya están acreditados ni a correos inválidos: ${parts.join(" y ")}.`
    : null;
}

function invalidEmailsNote(audience: InvitationAudience) {
  return audience.invalidEmails > 0
    ? `${people(audience.invalidEmails, "correo no es válido y se omite", "correos no son válidos y se omiten")}.`
    : null;
}

type SettingRowProps = {
  label: string;
  description: ReactNode;
  checked: boolean;
  /** The switch cannot move (an archived festival locks every row). */
  locked?: boolean;
  /** Why it cannot move; shown in the row, not a tooltip touch can't open. */
  lockedReason?: ReactNode;
  onToggle: () => void;
  children?: ReactNode;
};

function SettingRow({
  label,
  description,
  checked,
  locked = false,
  lockedReason,
  onToggle,
  children,
}: SettingRowProps) {
  const disabled = locked || !!lockedReason;
  const id = useId();
  const descriptionId = `${id}-description`;
  const reasonId = `${id}-reason`;

  return (
    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-1">
        <Label
          htmlFor={id}
          className={cn("text-sm font-medium", disabled && "text-muted-foreground")}
        >
          {label}
        </Label>
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
        {lockedReason ? (
          <p
            id={reasonId}
            className="flex items-start gap-1.5 text-xs text-amber-800"
          >
            <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {lockedReason}
          </p>
        ) : null}
        {children ? (
          <div className="flex flex-wrap gap-2 pt-2">{children}</div>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={
          lockedReason ? `${descriptionId} ${reasonId}` : descriptionId
        }
        // The switch asks first: it moves once the change is confirmed.
        onCheckedChange={() => onToggle()}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

/**
 * The switches that decide who can see and use the festival, each saying
 * what it does and, when it cannot move, why.
 */
export default function FestivalSettingsCard({
  festival,
  otherActiveFestival,
  isFestivalDayToday = false,
}: {
  festival: FestivalBase;
  /** Another festival that is active now; only one can be at a time. */
  otherActiveFestival?: { id: number; name: string } | null;
  /** Today is one of the festival's days, in the store's time zone. */
  isFestivalDayToday?: boolean;
}) {
  const [intent, setIntent] = useState<DialogIntent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const archived = festival.status === "archived";
  const active = festival.status === "active";
  const registrationOpen = active && festival.publicRegistration;

  function open(next: DialogIntent) {
    setIntent(next);
    setDialogOpen(true);
  }

  const reservationsStart = formatDisplayDate(
    festival.reservationsStartDate,
    DateTime.DATETIME_MED,
  );

  const visitorInvitation: FestivalSettingInvitation = {
    festivalId: festival.id,
    kind: "visitor_registration",
    optionLabel: (audience) =>
      `Invitar por correo a ${people(audience.recipients, "visitante", "visitantes")} de festivales anteriores`,
    audienceNote: visitorAudienceNote,
  };

  const dialog = (() => {
    if (!intent) return null;
    switch (intent.type) {
      case "status":
        return intent.enable
          ? {
              title: "Activar festival",
              description: `${festival.name} pasará a estar activo y visible para el público y los participantes.`,
              confirmLabel: "Activar festival",
              onConfirm: () => setFestivalActive(festival.id, true),
              // The invitation's button opens the festival's terms page.
              notice: festival.participantTermsEnabled
                ? null
                : "Los términos para participantes están deshabilitados en este festival: el botón de la invitación mostrará que aún no están disponibles. Habilítalos antes o después de activar.",
              invitation: {
                festivalId: festival.id,
                kind: "participant_activation",
                optionLabel: (audience: InvitationAudience) =>
                  `Invitar por correo a ${people(audience.recipients, "participante verificado", "participantes verificados")} de las categorías del festival`,
                audienceNote: invalidEmailsNote,
              } satisfies FestivalSettingInvitation,
            }
          : {
              title: "Desactivar festival",
              description:
                "El festival vuelve a borrador: el público deja de verlo y se cierran la acreditación y el registro en puerta.",
              confirmLabel: "Desactivar festival",
              destructive: true,
              onConfirm: () => setFestivalActive(festival.id, false),
            };
      case "registration":
        return intent.enable
          ? {
              title: "Abrir acreditación",
              description:
                "Los visitantes podrán obtener su entrada gratuita en el formulario público del festival.",
              confirmLabel: "Abrir acreditación",
              onConfirm: () => updateFestivalRegistration(festival.id, true),
              invitation: visitorInvitation,
            }
          : {
              title: "Cerrar acreditación",
              description:
                "El formulario deja de aceptar registros y se cierra también el registro en puerta. Las entradas ya emitidas siguen siendo válidas.",
              confirmLabel: "Cerrar acreditación",
              destructive: true,
              onConfirm: () => updateFestivalRegistration(festival.id, false),
            };
      case "invite-visitors":
        return {
          title: "Invitar a visitantes",
          description:
            "Envía la invitación para acreditarse a los visitantes de festivales anteriores que todavía no tienen entrada para este festival. Quienes ya la recibieron y no se acreditaron la recibirán de nuevo.",
          confirmLabel: "Enviar invitaciones",
          invitation: {
            ...visitorInvitation,
            optionLabel: (audience: InvitationAudience) =>
              `${people(audience.recipients, "visitante recibirá", "visitantes recibirán")} la invitación`,
          },
        };
      case "event-day":
        return intent.enable
          ? {
              title: "Habilitar registro en puerta",
              description:
                "Mientras esté habilitado, el formulario de acreditación solo entrega entradas para el día en curso: nadie elige otra fecha.",
              confirmLabel: "Habilitar",
              onConfirm: () =>
                updateFestivalEventDayRegistration(festival.id, true),
              notice: isFestivalDayToday
                ? null
                : "Hoy no es un día del festival: mientras esté habilitado, nadie podrá obtener entradas desde el formulario. Habilítalo el día del evento.",
            }
          : {
              title: "Deshabilitar registro en puerta",
              description:
                "El formulario de acreditación vuelve a pedir que cada visitante elija la fecha de su entrada.",
              confirmLabel: "Deshabilitar",
              destructive: true,
              onConfirm: () =>
                updateFestivalEventDayRegistration(festival.id, false),
            };
      case "terms":
        return intent.enable
          ? {
              title: "Habilitar términos para participantes",
              description:
                "Los participantes podrán ver y aceptar la versión publicada del documento global de términos.",
              confirmLabel: "Habilitar",
              onConfirm: () =>
                updateFestivalParticipantTerms(festival.id, true),
            }
          : {
              title: "Deshabilitar términos para participantes",
              description:
                "Los participantes no podrán leer ni aceptar los términos hasta que vuelvas a habilitarlos.",
              confirmLabel: "Deshabilitar",
              destructive: true,
              onConfirm: () =>
                updateFestivalParticipantTerms(festival.id, false),
            };
    }
  })();

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Estado y acceso</CardTitle>
        <CardDescription>
          Quién puede ver el festival y registrarse. Cada cambio se confirma
          antes de aplicarse.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {archived ? (
          <p className="mb-4 flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Este festival está archivado: sus ajustes ya no se pueden cambiar.
          </p>
        ) : null}
        <div className="divide-y">
          <SettingRow
            label="Festival activo"
            description={
              active
                ? `Visible para el público y los participantes. Las reservas abren el ${reservationsStart}.`
                : festival.status === "published"
                  ? "Publicado, pero todavía no activo: actívalo para abrir la acreditación."
                  : "En borrador: el público no ve el festival."
            }
            checked={active}
            locked={archived}
            lockedReason={
              !archived && !active && otherActiveFestival ? (
                <span>
                  Solo puede haber un festival activo y ahora lo está{" "}
                  <Link
                    href={`/dashboard/festivals/${otherActiveFestival.id}`}
                    className="font-medium underline"
                  >
                    {otherActiveFestival.name}
                  </Link>
                  . Desactívalo o archívalo primero.
                </span>
              ) : null
            }
            onToggle={() => open({ type: "status", enable: !active })}
          />

          <SettingRow
            label="Acreditación de visitantes"
            description="Formulario público donde los visitantes obtienen su entrada gratuita."
            checked={registrationOpen}
            locked={archived}
            lockedReason={
              !archived && !active
                ? "Activa el festival para abrir la acreditación."
                : null
            }
            onToggle={() =>
              open({ type: "registration", enable: !festival.publicRegistration })
            }
          >
            {registrationOpen ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => open({ type: "invite-visitors" })}
                >
                  <SendIcon className="mr-2 h-3.5 w-3.5" aria-hidden />
                  Invitar a visitantes
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link
                    href={`/festivals/${festival.id}/registration`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLinkIcon className="mr-2 h-3.5 w-3.5" aria-hidden />
                    Ver formulario
                  </Link>
                </Button>
              </>
            ) : null}
          </SettingRow>

          <SettingRow
            label="Registro en puerta"
            description="Para el día del evento: el formulario de acreditación solo entrega entradas para ese día."
            checked={registrationOpen && festival.eventDayRegistration}
            locked={archived}
            lockedReason={
              !archived && !registrationOpen
                ? "Abre la acreditación para habilitar el registro en puerta."
                : null
            }
            onToggle={() =>
              open({ type: "event-day", enable: !festival.eventDayRegistration })
            }
          >
            {registrationOpen &&
            festival.eventDayRegistration &&
            !isFestivalDayToday ? (
              <p className="flex items-start gap-1.5 text-xs text-amber-800">
                <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                Está habilitado y hoy no es un día del festival: nadie puede
                obtener entradas desde el formulario.
              </p>
            ) : null}
          </SettingRow>

          <SettingRow
            label="Términos para participantes"
            description="Los participantes pueden leer y aceptar los términos publicados."
            checked={festival.participantTermsEnabled}
            locked={archived}
            onToggle={() =>
              open({ type: "terms", enable: !festival.participantTermsEnabled })
            }
          />
        </div>
      </CardContent>

      {dialog ? (
        <FestivalSettingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          {...dialog}
        />
      ) : null}
    </Card>
  );
}
