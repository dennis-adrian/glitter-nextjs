import type { CouponProof } from "@/app/components/maps/festival-nav/festival-nav-stand-drawer";
import type {
  FestivalActivity,
  FestivalActivityWithDetailsAndParticipants,
} from "@/app/lib/festivals/definitions";
import {
  emptyStandActivityUserIds,
  isStandActivityFilter,
  type StandActivityUserIds,
} from "@/app/lib/maps/stand-filters";

export type MapActivityData = {
  activityUserIds: StandActivityUserIds;
  couponBookProofs: Record<number, CouponProof[]>;
  activityTypes: FestivalActivity["type"][];
};

function requiresApprovedProof(
  activity: FestivalActivityWithDetailsAndParticipants,
) {
  // Every marked activity is proof-gated: a badge claims the participant
  // actually completed it, not merely that they signed up.
  return isStandActivityFilter(activity.type);
}

export function getVisibleActivityParticipants(
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

/**
 * What the map needs to draw activity badges: who carries each marker, and the
 * promo text behind a coupon book entry.
 *
 * Shared by the festival page and the standalone map route so the two cannot
 * drift on who counts as taking part — the rule is "not removed, and holding an
 * approved proof", and a badge is a claim about a completed activity.
 */
export function getMapActivityData(
  activities: FestivalActivityWithDetailsAndParticipants[],
): MapActivityData {
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
