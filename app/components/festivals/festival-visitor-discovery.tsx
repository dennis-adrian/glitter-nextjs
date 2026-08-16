import { getStandMapParticipants } from "@/app/components/maps/map-participants";
import type { CouponProof } from "@/app/components/maps/festival-nav/festival-nav-stand-drawer";
import type { VisitorActivity } from "@/app/components/festivals/public-festival-activities";
import FestivalVisitorExplorer from "@/app/components/festivals/festival-visitor-explorer";
import { toPublicFestivalParticipant } from "@/app/components/festivals/participant-info";
import type { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import {
  fetchConfirmedProfilesByFestivalId,
  fetchFestivalSectors,
} from "@/app/lib/festival_sectors/actions";
import { fetchFestivalActivitiesByFestivalId } from "@/app/lib/festivals/actions";
import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import {
  emptyStandActivityUserIds,
  isStandActivityFilter,
} from "@/app/lib/maps/stand-filters";
import { stripHiddenReservationsFromSectors } from "@/app/lib/reservations/reveal";
import { formatStandLabel } from "@/app/lib/stands/helpers";

function requiresApprovedProof(
  activity: FestivalActivityWithDetailsAndParticipants,
) {
  // Every marked activity is proof-gated: a badge claims the participant
  // actually completed it, not merely that they signed up.
  return isStandActivityFilter(activity.type);
}

function getVisibleActivityParticipants(
  activity: FestivalActivityWithDetailsAndParticipants,
) {
  const participants = activity.details.flatMap(
    (detail) => detail.participants,
  );

  return participants.filter((participant) => {
    if (participant.removedAt != null) return false;
    if (!requiresApprovedProof(activity)) return true;

    return participant.proofs.some((proof) => proof.proofStatus === "approved");
  });
}

function getMapActivityData(
  activities: FestivalActivityWithDetailsAndParticipants[],
) {
  const activityUserIds = emptyStandActivityUserIds();
  const couponBookProofs: Record<number, CouponProof[]> = {};

  for (const activity of activities) {
    if (!isStandActivityFilter(activity.type)) continue;

    for (const participant of getVisibleActivityParticipants(activity)) {
      activityUserIds[activity.type].add(participant.userId);

      if (activity.type === "coupon_book") {
        const approvedProofs = participant.proofs.filter(
          (proof) => proof.proofStatus === "approved",
        );

        couponBookProofs[participant.userId] ??= [];
        couponBookProofs[participant.userId].push(
          ...approvedProofs.map((proof) => ({
            promoHighlight: proof.promoHighlight,
            promoDescription: proof.promoDescription,
            promoConditions: proof.promoConditions,
          })),
        );
      }
    }
  }

  return {
    activityUserIds,
    couponBookProofs,
    activityTypes: Array.from(
      new Set(activities.map((activity) => activity.type)),
    ),
  };
}

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
  const [rawSectors, activities, participants] = await Promise.all([
    fetchFestivalSectors(festivalId),
    fetchFestivalActivitiesByFestivalId(festivalId),
    fetchConfirmedProfilesByFestivalId(festivalId),
  ]);
  const sectors = toPublicMapSectors(
    stripHiddenReservationsFromSectors(rawSectors),
  );
  const publicParticipants = participants.map((participant) =>
    toPublicFestivalParticipant(participant, festivalId),
  );
  const publicActivities = activities.filter(
    (activity) => activity.accessLevel === "public",
  );
  const mapActivityData = getMapActivityData(publicActivities);
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
        getVisibleActivityParticipants(activity).map((participant) => [
          participant.userId,
          participant,
        ]),
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
