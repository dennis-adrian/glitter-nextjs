import { ReservationWithParticipantsAndUsers } from "@/app/api/reservations/definitions";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { ProfileWithSocials } from "@/app/api/users/definitions";

export function getParticipantProfilesWithStand(
  stands: StandWithReservationsWithParticipants[],
  reservations: ReservationWithParticipantsAndUsers[],
): {
  profile: ProfileWithSocials;
  stand: StandWithReservationsWithParticipants;
}[] {
  return reservations.flatMap((reservation) => {
    const reservationStand = stands.find(
      (stand) => stand.id === reservation.standId,
    );
    return reservation.participants.map((participant) => ({
      profile: participant.user,
      stand: reservationStand!,
    }));
  });
}

export function getParticipantIds(
  reservations: ReservationWithParticipantsAndUsers[],
) {
  return reservations.flatMap((reservation) =>
    reservation.participants.map((participant) => participant.user.id),
  );
}
