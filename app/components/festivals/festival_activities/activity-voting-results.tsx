import Link from "next/link";
import { ArrowLeftIcon, UsersIcon } from "lucide-react";

import VotingResultRow from "@/app/components/festivals/festival_activities/voting-result-row";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";

type ActivityVotingResultsProps = {
	activity: FestivalActivityWithDetailsAndParticipants;
};

export default function ActivityVotingResults({
	activity,
}: ActivityVotingResultsProps) {
	const showVariantHeaders = activity.details.length > 1;

	return (
		<div className="container p-4 md:p-6 space-y-6">
			<div className="flex items-center gap-2">
				<Link
					href={`/dashboard/festivals/${activity.festivalId}/festival_activities/${activity.id}`}
					aria-label="Back to festival activities"
					className="text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeftIcon className="w-4 h-4" />
				</Link>
				<h1 className="text-2xl font-bold leading-tight">
					Resultados — {activity.name}
				</h1>
			</div>

			{activity.details.map((detail, index) => {
				const activeParticipants = detail.participants.filter(
					(p) => !p.removedAt,
				);
				const activeParticipantIds = new Set(
					activeParticipants.map((participant) => participant.id),
				);
				const filteredVotes = detail.votes.filter((vote) => {
					if (vote.participantId === null) {
						return false;
					}
					return activeParticipantIds.has(vote.participantId);
				});
				const totalVotes = filteredVotes.length;
				const uniqueVoters = new Set(filteredVotes.map((vote) => vote.voterId))
					.size;

				const results = activeParticipants
					.map((participant) => ({
						participant,
						voteCount: filteredVotes.filter(
							(v) => v.participantId === participant.id,
						).length,
						hasVotedAllVariants: activity.details.every((d) => {
							const activeParticipantIdsForVariant = new Set(
								d.participants
									.filter((variantParticipant) => !variantParticipant.removedAt)
									.map((variantParticipant) => variantParticipant.id),
							);
							const participantVotes = d.votes.filter((v) => {
								if (
									v.voterId !== participant.userId ||
									v.participantId === null
								) {
									return false;
								}
								return activeParticipantIdsForVariant.has(v.participantId);
							});
							return participantVotes.some(
								(vote) => vote.voterId === participant.userId,
							);
						}),
					}))
					.sort((a, b) => b.voteCount - a.voteCount);
				const topScore = results[0]?.voteCount ?? 0;
				const topScorers = results.filter(
					(result) => result.voteCount === topScore,
				);
				const hasUniqueTopScorer = topScore > 0 && topScorers.length === 1;

				return (
					<div key={detail.id} className="space-y-4">
						{showVariantHeaders && (
							<h2 className="text-base font-semibold text-muted-foreground">
								Variante {index + 1}
								{detail.description ? ` — ${detail.description}` : ""}
							</h2>
						)}

						<div className="flex items-center gap-4 text-sm text-muted-foreground">
							<span className="flex items-center gap-1">
								<UsersIcon className="w-4 h-4" />
								{uniqueVoters} votante{uniqueVoters !== 1 ? "s" : ""} de{" "}
								{activeParticipants.length} participante
								{activeParticipants.length !== 1 ? "s" : ""}
							</span>
							<span>
								{totalVotes} voto{totalVotes !== 1 ? "s" : ""} en total
							</span>
						</div>

						{results.length === 0 ? (
							<p className="text-sm text-muted-foreground italic">
								No hay participantes en esta variante.
							</p>
						) : (
							<div className="space-y-3">
								{results.map(
									({ participant, voteCount, hasVotedAllVariants }, rank) => {
										const percentage =
											totalVotes > 0
												? Math.round((voteCount / totalVotes) * 100)
												: 0;
										const isEligibleWinner =
											hasUniqueTopScorer &&
											participant.id === topScorers[0].participant.id &&
											hasVotedAllVariants;

										return (
											<VotingResultRow
												key={participant.id}
												participant={participant}
												voteCount={voteCount}
												percentage={percentage}
												rank={rank}
												hasVotedAllVariants={hasVotedAllVariants}
												isEligibleWinner={isEligibleWinner}
												allDetails={activity.details}
											/>
										);
									},
								)}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
