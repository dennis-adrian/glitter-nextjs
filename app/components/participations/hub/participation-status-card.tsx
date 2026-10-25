import Link from "next/link";

import { CheckIcon } from "lucide-react";

import {
  getCardConfig,
  STATUS_CONFIG,
} from "@/app/components/participant_dashboard/reservation-card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/components/ui/avatar-radix";
import { Badge } from "@/app/components/ui/badge";
import { CATEGORY_LABELS } from "@/app/lib/festival-terms/copy";
import { formatFullDate } from "@/app/lib/formatters";
import type { ParticipationHub } from "@/app/lib/participations/hub";
import type { HubStatus } from "@/app/lib/participations/hub-status";
import { cn } from "@/app/lib/utils";
import { DateTime } from "luxon";

type Action = { label: string; href: string; primary?: boolean };

type Copy = {
  title: string;
  body?: string;
  actions: Action[];
};

const NO_STANDS_BADGE = {
  label: "Sin espacios",
  badgeStyle:
    "bg-amber-500/10 text-amber-800 border-amber-500/20 dark:text-amber-200",
};

function badgeFor(status: HubStatus) {
  if (status === "no_stands_available") return NO_STANDS_BADGE;
  const { label, badgeStyle } = STATUS_CONFIG[status];
  return { label, badgeStyle };
}

function categoryName(category: string) {
  return (
    CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? "tu categoría"
  );
}

/** What the card says, and offers, in each state of the participation. */
function copyFor(hub: ParticipationHub): Copy {
  const { status, festival, links, profile, isGastronomy } = hub;
  const opensOn = formatFullDate(
    festival.reservationsStartDate,
    DateTime.DATE_FULL,
  );
  const category = categoryName(profile.category);
  const reservationOrInvoices = links.reservation ?? links.invoices;

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
        actions: [{ label: "Ver el mapa", href: links.map }],
      };
    case "approved_enrollment":
      return {
        title: "Ya podés reservar tu stand",
        body:
          hub.availableStands === 1
            ? `Queda 1 espacio de ${category}.`
            : `Quedan ${hub.availableStands} espacios de ${category}.`,
        actions: [
          { label: "Reservar stand", href: links.reserve, primary: true },
          { label: "Mapa", href: links.map },
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
          ? [{ label: "Ver el mapa", href: links.map, primary: true }]
          : [
              { label: "Inscribirme", href: links.terms, primary: true },
              { label: "Mapa", href: links.map },
            ],
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
    case "confirmed_reservation":
      return {
        title: "",
        actions: [
          { label: "Reserva", href: reservationOrInvoices },
          { label: "Pagos", href: links.invoices },
          { label: "Términos", href: links.publicTerms },
          { label: "Productos", href: links.products },
        ],
      };
    case "rejected_reservation":
      return {
        title: "Tu reserva fue rechazada",
        body: "Si creés que es un error, escribinos y lo revisamos.",
        actions: [],
      };
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

/**
 * The participation at a glance: where it stands, the steps done, and the one
 * thing to do next. Once the reservation is confirmed it becomes the stand
 * itself, with the pages that belong to it.
 */
export default function ParticipationStatusCard({
  hub,
  showFestival = false,
}: {
  hub: ParticipationHub;
  /** Names the festival too, where no hero above the card already does. */
  showFestival?: boolean;
}) {
  const copy = copyFor(hub);
  const badge = badgeFor(hub.status);
  const confirmed = hub.status === "confirmed_reservation";

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
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-primary">
          {confirmed ? "Tu reserva" : "Tu participación"}
          {showFestival ? ` · ${hub.festival.name}` : null}
        </span>
        <Badge className={cn("shrink-0", badge.badgeStyle)}>
          {badge.label}
        </Badge>
      </div>

      {confirmed ? null : <Steps steps={hub.steps} />}

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

      {copy.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {copy.actions.map((action) => (
            <Link
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
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
