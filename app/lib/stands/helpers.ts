import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { BaseProfile } from "@/app/api/users/definitions";

export function canStandBeReserved(
  stand: StandWithReservationsWithParticipants,
  profile?: BaseProfile | null,
) {
  if (!profile) return false;

  const profileCategory =
    profile.category === "new_artist" ? "illustration" : profile.category;

  return (
    stand.standCategory === profileCategory && stand.status === "available"
  );
}
