"use client";

import type { ReservationWithParticipantsAndUsersAndStandAndCollaborators } from "@/app/api/reservations/definitions";
import TeamTabContent from "@/app/components/organisms/upcoming-festival/team-tab-content";
import { HubPanel } from "@/app/components/participations/hub/hub-section";

/**
 * The stand's team: who works it, and the form to add someone. The form and
 * its removal buttons are client components, so the section is one too.
 */
export default function HubTeam({
  reservation,
}: {
  reservation: ReservationWithParticipantsAndUsersAndStandAndCollaborators;
}) {
  return (
    <HubPanel>
      <TeamTabContent reservation={reservation} />
    </HubPanel>
  );
}
