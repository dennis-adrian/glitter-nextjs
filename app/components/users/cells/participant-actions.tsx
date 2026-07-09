"use client";

import { ParticipantProfile } from "@/app/lib/participants/definitions";
import ProfileQuickActions from "@/app/components/user_profile/public_profile/quick-actions";

export function ParticipantActionsCell({
  participant,
}: {
  participant: ParticipantProfile;
}) {
  return (
    <ProfileQuickActions
      profile={participant}
      activitySummary={participant.activitySummary}
    />
  );
}
