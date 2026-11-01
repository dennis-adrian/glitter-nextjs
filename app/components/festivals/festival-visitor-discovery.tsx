import { getStandMapParticipants } from "@/app/components/maps/map-participants";
import type { VisitorActivity } from "@/app/components/festivals/public-festival-activities";
import { cache } from "react";

import FestivalGuide, {
  buildGuideCards,
} from "@/app/components/festivals/festival-guide";
import FestivalVisitorExplorer from "@/app/components/festivals/festival-visitor-explorer";
import { fetchPublicFestivalParticipants } from "@/app/lib/festival_sectors/actions";
import { toPublicMapSectors } from "@/app/lib/festival_sectors/public";
import { fetchFestivalSectors } from "@/app/lib/festival_sectors/queries";
import { fetchFestivalActivitiesByFestivalId } from "@/app/lib/festivals/queries";
import {
  getMapActivityData,
  getVisibleActivityParticipants,
} from "@/app/lib/maps/activity-data";
import { stripHiddenReservationsFromSectors } from "@/app/lib/reservations/reveal";
import { formatStandLabel } from "@/app/lib/stands/helpers";

/**
 * Everything the visitor sections read, loaded once per request: the guide
 * and the map sit in separate loading boundaries and share this.
 */
const loadVisitorDiscovery = cache(async (festivalId: number) => {
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

  return { sectors, publicParticipants, visitorActivities, mapActivityData };
});

/**
 * "Guía del festival", with each card's live figure: the sectors and stands,
 * the participants, the activities, and the way to the venue.
 */
export async function FestivalGuideSection({
  festivalId,
  locationLabel = null,
  locationUrl = null,
}: {
  festivalId: number;
  locationLabel?: string | null;
  locationUrl?: string | null;
}) {
  const { sectors, publicParticipants, visitorActivities } =
    await loadVisitorDiscovery(festivalId);

  return (
    <FestivalGuide
      cards={buildGuideCards({
        sectorCount: sectors.length,
        standCount: sectors.reduce(
          (total, sector) =>
            total +
            sector.stands.filter((stand) => stand.status !== "disabled").length,
          0,
        ),
        participantCount: publicParticipants.length,
        activityNames: visitorActivities.map((activity) => activity.name),
        locationLabel,
        locationUrl,
      })}
    />
  );
}

/** The map with its search and sectors, the participants and the activities. */
export default async function FestivalVisitorDiscovery({
  festivalId,
  festivalName,
}: {
  festivalId: number;
  festivalName: string;
}) {
  const { sectors, publicParticipants, visitorActivities, mapActivityData } =
    await loadVisitorDiscovery(festivalId);

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
