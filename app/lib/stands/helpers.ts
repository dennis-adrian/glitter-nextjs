import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { BaseProfile } from "@/app/api/users/definitions";

export function canStandBeReserved(
  stand: StandWithReservationsWithParticipants,
  profile?: BaseProfile | null,
) {
  if (!profile) return false;

  return (
    stand.standCategory === profile.category && stand.status === "available"
  );
}
