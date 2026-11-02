import Link from "next/link";

import { CheckIcon, ClipboardListIcon, InfoIcon } from "lucide-react";

import {
  getCardConfig,
  STATUS_CONFIG,
} from "@/app/components/participant_dashboard/reservation-card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/components/ui/avatar-radix";
import TeamQuote from "@/app/components/molecules/team-quote";
import { Badge } from "@/app/components/ui/badge";
import { CATEGORY_LABELS } from "@/app/lib/festival-terms/copy";
import { formatDisplayDate, formatFullDate } from "@/app/lib/formatters";
import { PARTICIPANT_SUPPORT_EMAIL } from "@/app/lib/participants/helpers";
import { participationTasks } from "@/app/lib/home/participation-tasks";
import type { HomeTask } from "@/app/lib/home/tasks";
import type { ParticipationHub } from "@/app/lib/participations/hub";
import {
  isParticipationEnded,
  type HubStatus,
} from "@/app/lib/participations/hub-status";
import { cn } from "@/app/lib/utils";
import { DateTime } from "luxon";

type Action = { label: string; href: string; primary?: boolean };

type Copy = {
  title: string;
  body?: string;
  /** The team's own words, quoted under the body. */
  quote?: { label: string; text: string };
  /** A short fact beside the state, like a stand released earlier. */
  note?: string;
  actions: Action[];
};

const NO_STANDS_BADGE = {
  label: "Sin espacios",
  badgeStyle:
    "bg-amber-500/10 text-amber-800 border-amber-500/20 dark:text-amber-200",
};

const NEUTRAL_BADGE_STYLE =
  "bg-slate-500/10 text-slate-700 border-slate-500/20 dark:text-slate-200";

/**
 * Participant copy says what happened without pointing at anyone: a
 * reservation the team closed is "cancelada", never "rechazada".
 */
const CLOSED_BADGE = {
  label: "Reserva cancelada",
  badgeStyle: NEUTRAL_BADGE_STYLE,
};

const BLOCKED_BADGE = {
  label: "Reservas no disponibles",
  badgeStyle: NEUTRAL_BADGE_STYLE,
};

/** The participation's state as a badge; Inicio's festival card shows the same. */
export function badgeFor(
  status: HubStatus,
  reservationBlock?: { eligibleAt: Date | null } | null,
) {
  if (status === "no_stands_available") return NO_STANDS_BADGE;
  if (status === "rejected_reservation") return CLOSED_BADGE;
  if (status === "reservations_blocked") {
    const until = reservationBlock?.eligibleAt;
    return until
      ? {
          label: `Reservas desde el ${formatDisplayDate(until, { day: "numeric", month: "short" })}`,
          badgeStyle: NO_STANDS_BADGE.badgeStyle,
        }
      : BLOCKED_BADGE;
  }
  const { label, badgeStyle } = STATUS_CONFIG[status];
  return { label, badgeStyle };
}

export function categoryName(category: string) {
  return (
    CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? "tu categoría"
  );
}

/** Closes a sentence on a name, without a second mark after "¡Feliz Cumple!". */
function sentenceEnd(name: string) {
  return /[.!?…]$/.test(name.trim()) ? name.trim() : `${name.trim()}.`;
}

/** A reservation's detail page, the same one the reservation shortcut opens. */
function reservationHref(hub: ParticipationHub, reservationId: number) {
  return `/profiles/${hub.profile.id}/festivals/${hub.festival.id}/reservations/${reservationId}`;
}

/** Short button labels for the tasks a confirmed card can point to. */
const ACTION_LABELS: Record<string, string> = {
  "festival-products": "Subir productos",
  "festival-team": "Agregar a tu equipo",
};

/** What the card says, and offers, in each state of the participation. */
function copyFor(hub: ParticipationHub, tasks: HomeTask[]): Copy {
  const { status, festival, links, profile, isGastronomy } = hub;
  const opensOn = formatFullDate(
    festival.reservationsStartDate,
    DateTime.DATE_FULL,
  );
  const category = categoryName(profile.category);
  const released = hub.releasedReservation;
  const releasedNote = released
    ? `Liberaste el stand ${released.standLabel}${
        released.releasedAt
          ? ` el ${formatDisplayDate(released.releasedAt, { day: "numeric", month: "short" })}`
          : ""
      }. Los créditos que usaste no se devuelven.`
    : undefined;

  switch (status) {
    case "pending_enrollment":
      return {
        title: `Inscribite a ${festival.name}`,
        body: isGastronomy
          ? "Leé y aceptá los términos y condiciones de esta edición. Después el equipo revisa tu inscripción y te habilita para reservar."
          : new Date() < festival.reservationsStartDate
            ? `Leé y aceptá los términos y condiciones de esta edición: con eso completás tu inscripción. Las reservas abren el ${opensOn}.`
            : "Leé y aceptá los términos y condiciones de esta edición: con eso completás tu inscripción y ya podés reservar.",
        actions: [{ label: "Inscribirme", href: links.terms, primary: true }],
      };
    case "enrollment_pending_approval":
      return {
        title: "El equipo está revisando tu inscripción",
        body: "Te avisaremos por correo y con una notificación cuando se tome una decisión.",
        actions: [],
      };
    case "rejected_enrollment":
      return {
        title: "Tu inscripción no fue aprobada",
        body: `Esta vez no pudimos sumarte a ${festival.name}. Si tenés dudas, escribinos.`,
        actions: [],
      };
    case "waiting_for_reservations":
      return {
        title: `Las reservas abren el ${opensOn}`,
        body: "Ya completaste tu inscripción. Te avisamos cuando puedas elegir tu espacio.",
        actions: [],
      };
    case "approved_enrollment":
      return {
        title: hub.releasedReservation
          ? "Podés hacer una nueva reserva"
          : "Ya podés reservar tu stand",
        note: releasedNote,
        body:
          hub.availableStands === 1
            ? `Queda 1 espacio de ${category}.`
            : `Quedan ${hub.availableStands} espacios de ${category}.`,
        actions: [
          { label: "Reservar stand", href: links.reserve, primary: true },
        ],
      };
    case "no_stands_available": {
      const enrolled = hub.enrollment?.status === "accepted";
      return {
        title: `Los espacios de ${category} se agotaron`,
        body: enrolled
          ? "Las reservas sin pago vencen y a veces se libera un espacio. Revisá el mapa más adelante."
          : "Las reservas sin pago vencen y a veces se libera un espacio. Podés inscribirte igual para poder reservar si eso pasa.",
        actions: enrolled
          ? []
          : [{ label: "Inscribirme", href: links.terms, primary: true }],
      };
    }
    case "pending_payment":
    case "pending_payment_approval": {
      const banner = getCardConfig(
        status,
        festival.reservationsStartDate,
        hub.activeParticipations,
        hub.outstandingInvoiceCount,
        hub.reservationCount,
      ).banner;
      return {
        title: banner?.title ?? STATUS_CONFIG[status].label,
        body: banner?.description,
        actions: [
          {
            label:
              status === "pending_payment"
                ? "Completar el pago"
                : "Ver estado del pago",
            href: links.invoices,
            primary: true,
          },
          ...(links.reservation
            ? [{ label: "Mi reserva", href: links.reservation }]
            : []),
        ],
      };
    }
    case "confirmed_reservation": {
      // The stand's pages live in the shortcut grid; the card keeps one
      // button, for the first thing still pending, and none once all is done.
      const next = tasks[0];
      return {
        title: "",
        actions: next
          ? [
              {
                label:
                  ACTION_LABELS[next.key] ??
                  (next.key.startsWith("activity-")
                    ? "Ir a actividades"
                    : next.label),
                href: next.href,
                primary: true,
              },
            ]
          : [],
      };
    }
    case "rejected_reservation": {
      const closed = hub.closedReservation;
      const reason = closed?.reason ?? null;
      return {
        title: closed
          ? `Tu reserva del stand ${closed.standLabel} fue cancelada`
          : "Tu reserva fue cancelada",
        body: `El espacio volvió a estar disponible y no vas a poder hacer otra reserva en ${sentenceEnd(festival.name)}${
          reason ? "" : " Si creés que hay un error, escribinos."
        }`,
        quote: reason ? { label: "Motivo del equipo", text: reason } : undefined,
        actions: [
          { label: "Escribinos", href: `mailto:${PARTICIPANT_SUPPORT_EMAIL}` },
          ...(closed
            ? [{ label: "Ver detalle", href: reservationHref(hub, closed.reservationId) }]
            : []),
        ],
      };
    }
    case "reservations_blocked": {
      const until = hub.reservationBlock?.eligibleAt;
      const detail = {
        label: "Ver detalle",
        href: `/profiles/${profile.id}/infractions`,
      };
      if (!until) {
        return {
          title: "No podés reservar en esta edición",
          body: `Tu cuenta tiene una restricción activa que no permite reservar en ${sentenceEnd(festival.name)} En el detalle ves por qué y hasta cuándo dura.`,
          actions: [detail],
        };
      }
      // A delay moves when they can reserve within this edition; enrolling
      // now leaves them ready for that moment.
      const enrolled =
        hub.enrollment?.status === "accepted" ||
        hub.enrollment?.status === "pending";
      return {
        title: `Podés reservar desde el ${formatDisplayDate(until, {
          day: "numeric",
          month: "long",
          hour: "numeric",
          minute: "2-digit",
        })}`,
        body: `Tu cuenta tiene una restricción que demora tus reservas en ${sentenceEnd(festival.name)} En el detalle ves por qué.`,
        actions: enrolled
          ? [detail]
          : [
              { label: "Inscribirme", href: links.terms, primary: true },
              detail,
            ],
      };
    }
  }
}

function Steps({ steps }: { steps: ParticipationHub["steps"] }) {
  return (
    <ol
      aria-label="Pasos de tu participación"
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((step) => (
        <li
          key={step.key}
          className={cn(
            "flex flex-col gap-1 text-center text-[11px] font-semibold",
            step.done ? "text-brand-primary" : "text-brand-neutral",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-1.5 rounded-full",
              step.done ? "bg-brand-primary" : "bg-brand-lavender",
            )}
          />
          <span className="inline-flex items-center justify-center gap-0.5">
            {step.done ? (
              <CheckIcon className="size-3" aria-hidden="true" />
            ) : null}
            {step.label}
            <span className="sr-only">
              {step.done ? " (completado)" : " (pendiente)"}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function ConfirmedReservation({ hub }: { hub: ParticipationHub }) {
  const reservation = hub.reservation;
  if (!reservation) return null;

  const others = reservation.participants
    .map((participant) => participant.user)
    .filter((user) => user.id !== hub.profile.id);
  const standLabel = `Stand ${reservation.stand.label ?? ""}${reservation.stand.standNumber}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-xl font-bold text-brand-ink md:text-2xl">
          {standLabel} · {categoryName(hub.profile.category)}
        </span>
        <div className="flex -space-x-2">
          {reservation.participants.map(({ user }) => (
            <Avatar
              key={user.id}
              className="size-8 border-2 border-brand-card"
              title={user.displayName ?? undefined}
            >
              <AvatarImage alt="" src={user.imageUrl || ""} />
              <AvatarFallback>
                {(user.displayName ?? "?").slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
      </div>
      {others.length > 0 ? (
        <span className="text-sm text-brand-neutral">
          Compartido con{" "}
          {others.map((user) => user.displayName ?? "tu compañero").join(", ")}
        </span>
      ) : null}
    </div>
  );
}

/** A mail address opens the mail app; anything else navigates in the app. */
function ActionLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  if (href.startsWith("mailto:")) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/**
 * The participation at a glance: where it stands, the steps done, and the one
 * thing to do next. Once the reservation is confirmed it becomes the stand
 * itself, with the pages that belong to it.
 */
export default function ParticipationStatusCard({
  hub,
}: {
  hub: ParticipationHub;
}) {
  const tasks = participationTasks(hub);
  const copy = copyFor(hub, tasks);
  const badge = badgeFor(hub.status, hub.reservationBlock);
  const confirmed = hub.status === "confirmed_reservation";
  const ended = isParticipationEnded(hub.status);
  // The tasks are listed on Inicio; the card says how many. A lone task the
  // card's own button already does is not counted again.
  const primaryHref = copy.actions.find((action) => action.primary)?.href;
  const counted =
    tasks.length === 1 && tasks[0].href === primaryHref ? 0 : tasks.length;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-brand-card p-4 md:p-5",
        confirmed || copy.actions.some((action) => action.primary)
          ? "border-brand-primary/40"
          : "border-brand-border",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-brand-primary">
          {confirmed ? "Tu reserva" : "Tu participación"}
        </span>
        <Badge className={cn("shrink-0", badge.badgeStyle)}>
          {badge.label}
        </Badge>
      </div>

      {confirmed || ended ? null : <Steps steps={hub.steps} />}

      {copy.note ? (
        <p className="flex items-start gap-2 rounded-xl border border-brand-border bg-brand-lavender/20 px-3 py-2.5 text-sm text-brand-ink">
          <InfoIcon
            className="mt-0.5 size-4 shrink-0 text-brand-primary"
            aria-hidden="true"
          />
          {copy.note}
        </p>
      ) : null}

      {confirmed ? (
        <ConfirmedReservation hub={hub} />
      ) : (
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-xl font-bold leading-tight text-brand-ink">
            {copy.title}
          </h2>
          {copy.body ? (
            <p className="text-sm leading-relaxed text-brand-neutral">
              {copy.body}
            </p>
          ) : null}
        </div>
      )}

      {copy.quote ? (
        <TeamQuote label={copy.quote.label} text={copy.quote.text} />
      ) : null}


      {copy.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {copy.actions.map((action) => (
            <ActionLink
              key={action.label}
              href={action.href}
              className={cn(
                "inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors",
                action.primary
                  ? "flex-1 bg-brand-primary text-white hover:bg-brand-primary/90 dark:bg-primary"
                  : "border border-brand-border bg-brand-card text-brand-ink hover:border-brand-primary hover:text-brand-primary",
                confirmed && "h-9 px-3.5",
              )}
            >
              {action.label}
            </ActionLink>
          ))}
        </div>
      ) : null}

      {counted > 0 ? (
        <Link
          href="/portal"
          className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-brand-primary hover:underline"
        >
          <ClipboardListIcon className="size-4" aria-hidden="true" />
          {counted === 1 ? "1 tarea pendiente" : `${counted} tareas pendientes`}{" "}
          · verlas en Inicio
        </Link>
      ) : null}
    </div>
  );
}
