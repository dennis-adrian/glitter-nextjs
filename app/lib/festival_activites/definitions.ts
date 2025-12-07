import { festivalActivityVotes } from "@/db/schema";

export type NewFestivalActivityVote = typeof festivalActivityVotes.$inferInsert;

export type StandVotingItem = {
	standImage: string;
	standName: string;
	standId: number;
};
