import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";

/**
 * How many votes a participant received in a voting activity, counted only
 * once voting has closed: votes for their own entry, and votes for one of
 * their stands where the activity votes for stands. Null when the activity
 * does not vote, voting is still open, or they are not in it.
 */
export function countVotesReceived(
  activity: FestivalActivityWithDetailsAndParticipants,
  profileId: number,
  standIds: ReadonlySet<number>,
  now: Date,
): number | null {
  if (!activity.allowsVoting) return null;
  if (!activity.votingEndDate || now <= activity.votingEndDate) return null;

  const ownEntryIds = new Set(
    activity.details.flatMap((detail) =>
      detail.participants
        .filter((participant) => participant.userId === profileId)
        .map((participant) => participant.id),
    ),
  );
  if (ownEntryIds.size === 0) return null;

  return activity.details.reduce(
    (total, detail) =>
      total +
      detail.votes.filter(
        (vote) =>
          (vote.participantId != null && ownEntryIds.has(vote.participantId)) ||
          (vote.votableType === "stand" &&
            vote.standId != null &&
            standIds.has(vote.standId)),
      ).length,
    0,
  );
}
