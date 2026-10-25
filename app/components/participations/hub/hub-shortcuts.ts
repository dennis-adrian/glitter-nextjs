import type { HubShortcut } from "@/app/components/participations/hub/hub-quick-access";
import { HUB_SECTIONS } from "@/app/components/participations/hub/hub-quick-access";
import type { ParticipationHub } from "@/app/lib/participations/hub";

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
 * The phone's shortcuts. The team and the activities belong to a confirmed
 * stand, so before that they show, dimmed, as what is coming; a festival with
 * no talks has no talks shortcut at all.
 */
export function buildHubShortcuts(hub: ParticipationHub): HubShortcut[] {
  const available = hubSectionAvailability(hub);
  const shortcuts: HubShortcut[] = [
    { key: "team", ...HUB_SECTIONS.team, disabled: !available.team },
  ];
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
  return shortcuts;
}
