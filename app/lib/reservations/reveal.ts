import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";

/**
 * A reservation is hidden from participants while its `revealAt` is in the
 * future. Admins pre-reserve stands for special participants/brands but don't
 * want the reservation's identity to surface until reservations open for
 * everyone.
 */
export function isReservationHidden(
  reservation: { revealAt: Date | null },
  now: Date = new Date(),
): boolean {
  return (
    reservation.revealAt != null && reservation.revealAt.getTime() > now.getTime()
  );
}

/**
 * Strips still-hidden reservations from a stand so no participant/brand
 * identity is revealed before the reveal time. The stand keeps its real,
 * occupied status, so it still reads as reserved on the maps and cannot be
 * reserved by anyone — only the identity is withheld until the reveal time
 * passes, after which the reservation surfaces normally.
 */
export function stripHiddenReservations(
  stand: StandWithReservationsWithParticipants,
  now: Date = new Date(),
): StandWithReservationsWithParticipants {
  const visibleReservations = stand.reservations.filter(
    (reservation) => !isReservationHidden(reservation, now),
  );

  if (visibleReservations.length === stand.reservations.length) return stand;

  return {
    ...stand,
    reservations: visibleReservations,
  };
}

export function stripHiddenReservationsFromSectors(
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[],
  now: Date = new Date(),
): FestivalSectorWithStandsWithReservationsWithParticipants[] {
  return sectors.map((sector) => ({
    ...sector,
    stands: sector.stands.map((stand) => stripHiddenReservations(stand, now)),
  }));
}
