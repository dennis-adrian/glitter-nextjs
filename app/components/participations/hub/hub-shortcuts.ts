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
    {
      key: "reservation",
      label: "Reserva",
      href: hub.links.reservation ?? hub.links.invoices,
      icon: TicketIcon,
    },
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
 * The phone's one grid of shortcuts. Before the stand is confirmed, the team
 * and the activities show dimmed, as what is coming; once confirmed, the
 * reservation's pages join the same grid instead of crowding the card. A
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
  if (hub.isConfirmed) shortcuts.push(termsShortcut(hub));
  return shortcuts;
}

/**
 * The desktop shows the team, the activities, the schedule and the talks on
 * the page itself, so only the confirmed reservation's outside pages get a
 * shortcut there.
 */
export function buildDesktopShortcuts(hub: ParticipationHub): HubShortcut[] {
  if (!hub.isConfirmed) return [];
  return [...reservationShortcuts(hub), termsShortcut(hub)];
}
