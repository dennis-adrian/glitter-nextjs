// This methods should be used in both ui and sever

import { UserCategory } from "@/app/api/users/definitions";
import { getFestivalSectorAllowedCategories } from "../festival_sectors/helpers";
import {
  Festival,
  FestivalActivityWithDetailsAndParticipants,
  FestivalBase,
  FestivalWithSectors,
} from "./definitions";

export function getFestivalAvaibleStandsByCategory(
  festival?: Festival | null,
  category?: UserCategory,
) {
  if (!(festival && category)) return [];
  const stands = festival.festivalSectors.flatMap((sector) => sector.stands);
  return stands.filter(
    (stand) => stand.status === "available" && stand.standCategory === category,
  );
}

export function getFestivalCategories(festival?: FestivalWithSectors | null) {
  if (!festival) return [];

  const sectorsCategories = festival.festivalSectors.flatMap((sector) =>
    getFestivalSectorAllowedCategories(sector, true),
  );

  return [...new Set(sectorsCategories)];
}

/**
 * An activity as a participant's own pages may hand it to client components,
 * for the profile `viewerId`: that profile keeps its own votes, waitlist entry,
 * removal reason and proof feedback. Everyone else keeps their profile and
 * design images, which the cards count and list, but not the votes they cast
 * (who voted for whom), their place on the waitlist, why they were removed, the
 * feedback staff left on their proofs or their unpublished promo text. A
 * client prop is serialized into the page whether or not the component reads
 * it.
 *
 * Staff screens read activities unscoped; never pass a staff viewer here
 * expecting the full activity back.
 */
export function scopeActivityToViewer(
  activity: FestivalActivityWithDetailsAndParticipants,
  viewerId: number | null,
): FestivalActivityWithDetailsAndParticipants {
  return {
    ...activity,
    details: activity.details.map((detail) => ({
      ...detail,
      votes: detail.votes.filter((vote) => vote.voterId === viewerId),
      participants: detail.participants.map((participant) =>
        participant.userId === viewerId
          ? participant
          : {
              ...participant,
              removalReason: null,
              proofs: participant.proofs.map((proof) => ({
                ...proof,
                adminFeedback: null,
                promoHighlight: null,
                promoDescription: null,
                promoConditions: null,
              })),
            },
      ),
    })),
    waitlistEntries: activity.waitlistEntries.filter(
      (entry) => entry.userId === viewerId,
    ),
  };
}

/**
 * A festival as a participant's own pages may hand it to client components,
 * for the profile `viewerId`. The roster — every enrolled profile with its
 * participations, and every reservation — carries other participants' contact
 * details, so it is dropped; the activities keep only what that profile may
 * see of other participants (`scopeActivityToViewer`). A client prop is
 * serialized into the page whether or not the component reads it.
 */
export function withoutParticipantRoster<
  T extends {
    userRequests: unknown[];
    standReservations: unknown[];
    festivalActivities: FestivalActivityWithDetailsAndParticipants[];
  },
>(festival: T, viewerId: number | null): T {
  return {
    ...festival,
    userRequests: [],
    standReservations: [],
    festivalActivities: festival.festivalActivities.map((activity) =>
      scopeActivityToViewer(activity, viewerId),
    ),
  };
}

export function getFestivalsOptions(festivals: FestivalBase[]) {
  return festivals.map((festival) => ({
    label: festival.name,
    value: festival.id.toString(),
  }));
}

export function groupVisitorEmails(visitors: { id: number; email: string }[]) {
  // Resend has a limit of 50 emails per group and the first email is the sender the other 49 will be in bcc
  const maxEmailsPerGroup = 49;
  const visitorEmails = visitors.map((visitor) => visitor.email);
  let emailGroups: string[][] = [];
  for (let i = 0; i < visitorEmails.length; i += maxEmailsPerGroup) {
    let group = visitorEmails.slice(i, i + maxEmailsPerGroup);
    emailGroups.push(group);
  }

  return emailGroups;
}
