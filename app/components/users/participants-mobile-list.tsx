"use client";

import { ParticipantProfile } from "@/app/lib/participants/definitions";
import ParticipantMobileCard from "@/app/components/users/participant-mobile-card";

type Props = {
  participants: ParticipantProfile[];
};

export default function ParticipantsMobileList({ participants }: Props) {
  if (!participants.length) {
    return (
      <div className="h-24 rounded-md border text-center text-sm text-muted-foreground flex items-center justify-center">
        Sin resultados
      </div>
    );
  }

  return participants.map((participant) => (
    <ParticipantMobileCard key={participant.id} participant={participant} />
  ));
}
