import { getStandMapParticipants } from "@/app/components/maps/map-participants";
import type { VisitorActivity } from "@/app/components/festivals/public-festival-activities";
import FestivalVisitorExplorer from "@/app/components/festivals/festival-visitor-explorer";
import type { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import {
  fetchFestivalSectors,
  fetchPublicFestivalParticipants,
} from "@/app/lib/festival_sectors/actions";
import { fetchFestivalActivitiesByFestivalId } from "@/app/lib/festivals/actions";
import {
  getMapActivityData,
  getVisibleActivityParticipants,
} from "@/app/lib/maps/activity-data";
import { stripHiddenReservationsFromSectors } from "@/app/lib/reservations/reveal";
import { formatStandLabel } from "@/app/lib/stands/helpers";

function toPublicMapSectors(
  sectors: FestivalSectorWithStandsWithReservationsWithParticipants[],
): FestivalSectorWithStandsWithReservationsWithParticipants[] {
  return sectors.map((sector) => ({
    ...sector,
    stands: sector.stands.map((stand) => ({
      ...stand,
      reservations: stand.reservations.map((reservation) => ({
        ...reservation,
        participants: reservation.participants.map((participant) => ({
          ...participant,
          user: {
            id: participant.user.id,
            displayName: participant.user.displayName,
            imageUrl: participant.user.imageUrl,
            category: participant.user.category,
            userSocials: [],
            profileSubcategories: participant.user.profileSubcategories ?? [],
          },
        })),
        externalParticipants: reservation.externalParticipants,
      })),
    })),
  })) as unknown as FestivalSectorWithStandsWithReservationsWithParticipants[];
}

export default async function FestivalVisitorDiscovery({
  festivalId,
  festivalName,
}: {
  festivalId: number;
  festivalName: string;
}) {
  const [rawSectors, activities, publicParticipants] = await Promise.all([
    fetchFestivalSectors(festivalId),
    fetchFestivalActivitiesByFestivalId(festivalId),
    fetchPublicFestivalParticipants(festivalId),
  ]);
  const sectors = toPublicMapSectors(
    stripHiddenReservationsFromSectors(rawSectors),
  );
  const publicActivities = activities.filter(
    (activity) => activity.accessLevel === "public",
  );
  const mapActivityData = getMapActivityData(publicActivities);
  const publicParticipantIds = new Set(
    publicParticipants.map((participant) => participant.id),
  );
  const participantLocationByUserId = new Map<
    number,
    { sectorName: string; standLabel: string }
  >();

  for (const sector of sectors) {
    for (const stand of sector.stands) {
      for (const participant of getStandMapParticipants(stand)) {
        if (participant.kind !== "user") continue;
        participantLocationByUserId.set(participant.userId, {
          sectorName: sector.name,
          standLabel: formatStandLabel(stand),
        });
      }
    }
  }

  const visitorActivities: VisitorActivity[] = publicActivities.map(
    (activity) => {
      const uniqueParticipants = new Map(
        getVisibleActivityParticipants(activity)
          .filter((participant) =>
            publicParticipantIds.has(participant.userId),
          )
          .map((participant) => [participant.userId, participant]),
      );

      return {
        id: activity.id,
        name: activity.name,
        description:
          activity.visitorsDescription?.trim() ||
          activity.description?.trim() ||
          "Conocé esta actividad y los stands que forman parte.",
        promotionalArtUrl: activity.promotionalArtUrl,
        type: activity.type,
        participants: Array.from(uniqueParticipants.values())
          .map((participant) => ({
            id: participant.userId,
            displayName: participant.user.displayName || "Participante",
            imageUrl: participant.user.imageUrl,
            ...participantLocationByUserId.get(participant.userId),
          }))
          .sort((a, b) => {
            const aHasStand = Boolean(a.standLabel);
            const bHasStand = Boolean(b.standLabel);
            if (aHasStand !== bHasStand) {
              return aHasStand ? -1 : 1;
            }

            const standComparison = (a.standLabel ?? "").localeCompare(
              b.standLabel ?? "",
              "es",
              { numeric: true },
            );
            return (
              standComparison ||
              a.displayName.localeCompare(b.displayName, "es")
            );
          }),
      };
    },
  );

  return (
    <FestivalVisitorExplorer
      festivalName={festivalName}
      sectors={sectors}
      participants={publicParticipants}
      activities={visitorActivities}
      mapActivityData={mapActivityData}
    />
  );
}
