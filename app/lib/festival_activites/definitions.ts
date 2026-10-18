import { festivalActivityVotes } from "@/db/schema";

export type NewFestivalActivityVote = typeof festivalActivityVotes.$inferInsert;

/** A vote as the voter submits it. The server sets the voter from the session. */
export type FestivalActivityVoteInput =
  | { activityVariantId: number; votableType: "stand"; standId: number }
  | {
      activityVariantId: number;
      votableType: "participant";
      participantId: number;
    };

export type StandVotingItem = {
  standImage: string;
  standName: string;
  standId: number;
};

export type ParticipantVotingItem = {
  participantImage: string;
  participantName: string;
  participantId: number;
};

/** An uploaded proof image and the receipt its upload route signed for it. */
export type SignedActivityProofUpload = { imageUrl: string; receipt: string };
