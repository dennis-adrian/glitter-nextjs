import { BaseProfile } from "@/app/api/users/definitions";

export function getParticipantsOptions(participants: BaseProfile[]) {
  return participants.map((participant) => ({
    label: participant.displayName || "Sin nombre",
    value: participant.id.toString(),
    imageUrl: participant.imageUrl,
  }));
}
