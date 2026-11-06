import {
  FileTextIcon,
  ImageIcon,
  ReceiptTextIcon,
  TicketIcon,
} from "lucide-react";

import type { HubShortcut } from "@/app/components/participations/hub/hub-quick-access";
import { HUB_SECTIONS } from "@/app/components/participations/hub/hub-quick-access";
import type { ParticipationHub } from "@/app/lib/participations/hub";
import { isParticipationEnded } from "@/app/lib/participations/hub-status";

/** Which of the hub's sections exist for this participation, and which wait. */
export function hubSectionAvailability(hub: ParticipationHub) {
  return {
    team: hub.isConfirmed && hub.reservation != null,
    schedule: hub.festival.festivalDates.length > 0,
    activities: hub.isConfirmed && hub.activities.length > 0,
    programs: hub.sessions.length > 0,
  };
}

/**
 * The confirmed reservation's own pages, which live outside the hub: the
 * reservation, its payments, the product images and the festival's terms.
 */
function reservationShortcuts(hub: ParticipationHub): HubShortcut[] {
  return [
    // With several reservations there is no single page to open, and the
    // payments page already lists them all: no second link to the same place.
    ...(hub.links.reservation
      ? [
          {
            key: "reservation",
            label: "Reserva",
            href: hub.links.reservation,
            icon: TicketIcon,
          },
        ]
      : []),
    {
      key: "payments",
      label: "Pagos",
      href: hub.links.invoices,
      icon: ReceiptTextIcon,
    },
    {
      key: "products",
      label: "Productos",
      href: hub.links.products,
      icon: ImageIcon,
    },
  ];
}

const termsShortcut = (hub: ParticipationHub): HubShortcut => ({
  key: "terms",
  label: "Términos",
  href: hub.links.publicTerms,
  icon: FileTextIcon,
});

/**
 * Whether they have accepted the festival's terms, so there is something of
 * theirs to read again: enrolled, or holding a reservation.
 */
export function hasAcceptedTerms(hub: ParticipationHub): boolean {
  return (
    hub.hasReservation ||
    hub.enrollment?.status === "accepted" ||
    hub.enrollment?.status === "pending"
  );
}

/**
 * The phone's one grid of shortcuts. Before the stand is confirmed, the team
 * and the activities show dimmed, as what is coming; once confirmed, the
 * reservation's pages join the same grid instead of crowding the card. The
 * terms they accepted stay a tap away from the moment they accept them. A
 * festival with no talks has no talks shortcut, and a participation that has
 * ended has nothing left to open.
 */
export function buildHubShortcuts(hub: ParticipationHub): HubShortcut[] {
  if (isParticipationEnded(hub.status)) return [];

  const available = hubSectionAvailability(hub);
  const shortcuts: HubShortcut[] = hub.isConfirmed
    ? reservationShortcuts(hub)
    : [];

  shortcuts.push({ key: "team", ...HUB_SECTIONS.team, disabled: !available.team });
  if (available.schedule) {
    shortcuts.push({ key: "schedule", ...HUB_SECTIONS.schedule });
  }
  if (!hub.isConfirmed || hub.activities.length > 0) {
    shortcuts.push({
      key: "activities",
      ...HUB_SECTIONS.activities,
      disabled: !available.activities,
    });
  }
  if (available.programs) {
    shortcuts.push({ key: "programs", ...HUB_SECTIONS.programs });
  }
  if (hub.isConfirmed || hasAcceptedTerms(hub)) {
    shortcuts.push(termsShortcut(hub));
  }
  return shortcuts;
}

/**
 * The desktop shows the team, the activities, the schedule and the talks on
 * the page itself, so only the outside pages get a shortcut there: the terms
 * once accepted, and the confirmed reservation's pages.
 */
export function buildDesktopShortcuts(hub: ParticipationHub): HubShortcut[] {
  if (isParticipationEnded(hub.status)) return [];
  if (!hub.isConfirmed) {
    return hasAcceptedTerms(hub) ? [termsShortcut(hub)] : [];
  }
  return [...reservationShortcuts(hub), termsShortcut(hub)];
}
