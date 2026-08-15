import { getStandMapParticipants } from "@/app/components/maps/map-participants";
import type { CouponProof } from "@/app/components/maps/festival-nav/festival-nav-stand-drawer";
import PublicFestivalActivities, {
  type VisitorActivity,
} from "@/app/components/festivals/public-festival-activities";
import FestivalVisitorExplorer from "@/app/components/festivals/festival-visitor-explorer";
import { toPublicFestivalParticipant } from "@/app/components/festivals/participant-info";
import type { FestivalSectorWithStandsWithReservationsWithParticipants } from "@/app/lib/festival_sectors/definitions";
import {
  fetchConfirmedProfilesByFestivalId,
  fetchFestivalSectors,
} from "@/app/lib/festival_sectors/actions";
import { fetchFestivalActivitiesByFestivalId } from "@/app/lib/festivals/actions";
import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { stripHiddenReservationsFromSectors } from "@/app/lib/reservations/reveal";
import { formatStandLabel } from "@/app/lib/stands/helpers";

function requiresApprovedProof(
  activity: FestivalActivityWithDetailsAndParticipants,
) {
  return (
    activity.type === "coupon_book" ||
    activity.type === "stamp_passport" ||
    activity.type === "sticker_hunt"
  );
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
  const couponBookUserIds = new Set<number>();
  const passportUserIds = new Set<number>();
  const stickerHuntUserIds = new Set<number>();
  const couponBookProofs: Record<number, CouponProof[]> = {};

  for (const activity of activities) {
    for (const participant of getVisibleActivityParticipants(activity)) {
      if (activity.type === "coupon_book") {
        couponBookUserIds.add(participant.userId);
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

      if (activity.type === "stamp_passport") {
        passportUserIds.add(participant.userId);
      }

      if (activity.type === "sticker_hunt") {
        stickerHuntUserIds.add(participant.userId);
      }
    }
  }

  return {
    couponBookUserIds: Array.from(couponBookUserIds),
    couponBookProofs,
    passportUserIds: Array.from(passportUserIds),
    stickerHuntUserIds: Array.from(stickerHuntUserIds),
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
    <div className="space-y-16 sm:space-y-20">
      <FestivalVisitorExplorer
        festivalName={festivalName}
        sectors={sectors}
        participants={publicParticipants}
        mapActivityData={mapActivityData}
      />

      <PublicFestivalActivities activities={visitorActivities} />
    </div>
  );
}
