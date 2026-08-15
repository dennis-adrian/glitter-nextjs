import type { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import type { UserCategory } from "@/app/api/users/definitions";
import type { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import { formatStandLabel } from "@/app/lib/stands/helpers";

export type ParticipantSearchEntry = {
  userId: number;
  category: UserCategory;
  displayName: string;
  imageUrl: string | null;
  standLabel: string;
  sectorName: string;
  sectorIndex: number;
  stand: StandWithReservationsWithParticipants;
};

export function normalizeParticipantSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export function buildParticipantSearchEntries(
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[],
): ParticipantSearchEntry[] {
  const entries: ParticipantSearchEntry[] = [];

  sectors.forEach((sector, sectorIndex) => {
    sector.stands.forEach((stand) => {
      if (stand.status === "disabled") return;
      const standLabel = formatStandLabel(stand);

      stand.reservations
        .filter((reservation) => reservation.status !== "rejected")
        .flatMap((reservation) => reservation.participants)
        .forEach((participant) => {
          if (!participant.user.displayName) return;
          entries.push({
            userId: participant.user.id,
            category: participant.user.category,
            displayName: participant.user.displayName,
            imageUrl: participant.user.imageUrl,
            standLabel,
            sectorName: sector.name,
            sectorIndex,
            stand,
          });
        });
    });
  });

  return entries;
}
