import type { CardStatus } from "@/app/components/participant_dashboard/reservation-card";

/**
 * The participation hub's decisions, kept free of data fetching so each rule
 * is tested on its own: which state the participation is in, which steps are
 * done, what is still pending, and the participant schedule.
 *
 * The participation states are the portal card's (`getCardStatus`), so both
 * screens always agree; the hub adds one of its own, a category with no stand
 * left to reserve.
 */

export type HubStatus = CardStatus | "no_stands_available";

export type HubStatusInput = {
  cardStatus: CardStatus;
  /** Stands still available in the participant's category. */
  availableStands: number;
  /** Whether self-service reservations have opened for the festival. */
  reservationsOpen: boolean;
};

/**
 * Someone who could reserve right now, or who could enroll and then reserve,
 * but whose category has nothing left, is told so instead of being sent to an
 * empty map.
 */
export function resolveHubStatus({
  cardStatus,
  availableStands,
  reservationsOpen,
}: HubStatusInput): HubStatus {
  const couldReserve =
    cardStatus === "approved_enrollment" ||
    (cardStatus === "pending_enrollment" && reservationsOpen);

  if (couldReserve && availableStands === 0) return "no_stands_available";
  return cardStatus;
}

export type EnrollmentStatus = "pending" | "accepted" | "rejected" | null;

export type HubStep = { key: string; label: string; done: boolean };

/**
 * The bar across the participation card. Enrolling is accepting the festival's
 * terms; only gastronomy then waits for the team's review, so only gastronomy
 * sees that step. Only completed steps are marked: the next one reads from
 * where the marks stop.
 */
export function buildSteps({
  isGastronomy,
  enrollmentStatus,
  hasReservation,
  isConfirmed,
}: {
  isGastronomy: boolean;
  enrollmentStatus: EnrollmentStatus;
  hasReservation: boolean;
  isConfirmed: boolean;
}): HubStep[] {
  const enrolled =
    enrollmentStatus === "pending" || enrollmentStatus === "accepted";

  return [
    {
      key: "enrollment",
      label: "Inscripción",
      done: enrolled || hasReservation,
    },
    ...(isGastronomy
      ? [
          {
            key: "review",
            label: "Revisión",
            done: enrollmentStatus === "accepted" || hasReservation,
          },
        ]
      : []),
    { key: "reservation", label: "Reserva", done: hasReservation },
    { key: "payment", label: "Pago", done: isConfirmed },
  ];
}

export type HubPendingItem = {
  key: string;
  label: string;
  done: boolean;
  /** Where to go to do it; absent when there is nothing to do but wait. */
  href?: string;
  /** A short note beside it: a count, a deadline, "en revisión". */
  meta?: string;
};

export type HubLinks = {
  terms: string;
  reserve: string;
  invoices: string;
  products: string;
  team: string;
};

export const TEAM_LIMIT = 4;

/**
 * What the participant still has to do for this festival, in the order it
 * comes up. Finished steps stay on the list, ticked, so the list also shows
 * progress; things that do not apply yet are left off.
 */
export function buildPendingItems({
  status,
  isGastronomy,
  enrollmentStatus,
  hasReservation,
  isConfirmed,
  shouldSubmitProducts,
  teamCount,
  links,
}: {
  status: HubStatus;
  isGastronomy: boolean;
  enrollmentStatus: EnrollmentStatus;
  hasReservation: boolean;
  isConfirmed: boolean;
  shouldSubmitProducts: boolean;
  teamCount: number;
  links: HubLinks;
}): HubPendingItem[] {
  const items: HubPendingItem[] = [];
  const enrolled =
    hasReservation ||
    enrollmentStatus === "pending" ||
    enrollmentStatus === "accepted";

  if (enrollmentStatus === "rejected" && !hasReservation) return items;

  items.push(
    enrolled
      ? { key: "enrollment", label: "Inscripción", done: true, meta: "lista" }
      : {
          key: "enrollment",
          label: "Inscribirte al festival",
          done: false,
          href: links.terms,
        },
  );

  if (isGastronomy && enrollmentStatus === "pending" && !hasReservation) {
    items.push({
      key: "review",
      label: "Revisión del equipo",
      done: false,
      meta: "en curso",
    });
  }

  if (hasReservation || enrollmentStatus === "accepted") {
    items.push(
      hasReservation
        ? { key: "reservation", label: "Reserva", done: true, meta: "lista" }
        : {
            key: "reservation",
            label: "Reservar tu espacio",
            done: false,
            href: status === "approved_enrollment" ? links.reserve : undefined,
            meta:
              status === "waiting_for_reservations"
                ? "aún no abre"
                : status === "no_stands_available"
                  ? "sin espacios"
                  : undefined,
          },
    );
  }

  if (hasReservation) {
    items.push(
      isConfirmed
        ? { key: "payment", label: "Pago", done: true, meta: "confirmado" }
        : status === "pending_payment_approval"
          ? {
              key: "payment",
              label: "Pago de la reserva",
              done: false,
              href: links.invoices,
              meta: "en revisión",
            }
          : {
              key: "payment",
              label: "Pagar tu reserva",
              done: false,
              href: links.invoices,
            },
    );
  }

  if (hasReservation && shouldSubmitProducts) {
    items.push({
      key: "products",
      label: "Subir imágenes de tus productos",
      done: false,
      href: links.products,
    });
  }

  if (isConfirmed) {
    items.push({
      key: "team",
      label: teamCount > 0 ? "Tu equipo" : "Agregar a tu equipo",
      done: teamCount > 0,
      href: links.team,
      meta: `${teamCount} de ${TEAM_LIMIT}`,
    });
  }

  return items;
}

export type ScheduleEntry = {
  label: string;
  startsAt: Date;
  /** Set for a span, like teardown. */
  endsAt?: Date;
  /** The moment a participant has to be there. */
  highlight?: boolean;
};

export type ScheduleDay = { day: number; date: Date; entries: ScheduleEntry[] };

const MINUTE = 60_000;

/**
 * The participant's timetable, from each festival day's public hours: setup
 * starts an hour before doors open, the venue closes half an hour after them,
 * and on the last day there are 45 minutes to pack up. Each day uses its own
 * hours, so a festival whose days differ is shown as it is.
 */
export function buildParticipantSchedule(
  festivalDates: readonly { startDate: Date; endDate: Date }[],
): ScheduleDay[] {
  const days = [...festivalDates].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );

  return days.map(({ startDate, endDate }, index) => {
    const last = index === days.length - 1;
    const entries: ScheduleEntry[] = [
      {
        label: "Ingreso de participantes y armado",
        startsAt: new Date(startDate.getTime() - 60 * MINUTE),
        highlight: true,
      },
      { label: "Ingreso del público", startsAt: startDate },
      { label: "Cierre de puertas al público", startsAt: endDate },
      ...(last
        ? [
            {
              label: "Desarmado",
              startsAt: endDate,
              endsAt: new Date(endDate.getTime() + 45 * MINUTE),
            },
            {
              label: "Cierre del recinto",
              startsAt: new Date(endDate.getTime() + 45 * MINUTE),
            },
          ]
        : [
            {
              label: "Cierre del recinto",
              startsAt: new Date(endDate.getTime() + 30 * MINUTE),
            },
          ]),
    ];

    return { day: index + 1, date: startDate, entries };
  });
}

/** Whole days until the festival starts, or null once it has. */
export function daysUntil(start: Date | undefined, now: Date): number | null {
  if (!start) return null;
  const days = Math.ceil(
    (start.getTime() - now.getTime()) / (24 * 60 * MINUTE),
  );
  return days > 0 ? days : null;
}
