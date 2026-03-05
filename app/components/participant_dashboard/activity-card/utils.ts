import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import {
	ActivityTheme,
	EnrolledConfig,
} from "@/app/components/participant_dashboard/activity-card/types";

export function getEnrolledConfig(
	activity: FestivalActivityWithDetailsAndParticipants,
	profileId: number,
	hasUploadedProof: boolean,
): EnrolledConfig {
	if (activity.allowsVoting) {
		const hasVotedAll = activity.details.every((variant) =>
			variant.votes.some((vote) => vote.voterId === profileId),
		);

		return {
			pendingLabel: "Votación pendiente",
			pendingDescription:
				"Emite tu voto para elegir el mejor stand del festival",
			ctaLabel: "Votar Ahora",
			ctaType: "link",
			deadlineDate: activity.votingEndDate,
			isPending: !hasVotedAll,
		};
	}

	return {
		pendingLabel: "Diseño de sello pendiente",
		pendingDescription:
			"Sube el diseño de tu sello personalizado para confirmar tu participación",
		ctaLabel: "Subir Diseño",
		ctaType: "upload",
		deadlineDate: activity.proofUploadLimitDate,
		isPending: !hasUploadedProof,
	};
}

export function getEnrollmentInfo(
	activity: FestivalActivityWithDetailsAndParticipants,
	profileId: number,
) {
	const participants = activity.details.flatMap(
		(detail) => detail.participants,
	);
	const participation = participants.find((p) => p.userId === profileId);

	if (!participation) return { isEnrolled: false } as const;

	return {
		isEnrolled: true,
		participationId: participation.id,
		hasUploadedProof: (participation.proofs?.length ?? 0) > 0,
	} as const;
}

const PRIMARY = "hsl(var(--primary))";
const PRIMARY_FG = "hsl(var(--primary-foreground))";

export function getActivityTheme(index: number): ActivityTheme {
	if (index % 2 !== 0) {
		return {
			bg: PRIMARY_FG,
			border: PRIMARY,
			accent: PRIMARY,
			accentText: PRIMARY_FG,
			textPrimary: PRIMARY,
			textSecondary: PRIMARY,
			buttonBg: PRIMARY,
			buttonText: PRIMARY_FG,
			isPrimary: false,
		};
	}

	return {
		bg: PRIMARY,
		border: PRIMARY_FG,
		accent: PRIMARY_FG,
		accentText: PRIMARY,
		textPrimary: PRIMARY_FG,
		textSecondary: PRIMARY_FG,
		buttonBg: PRIMARY_FG,
		buttonText: PRIMARY,
		isPrimary: true,
	};
}
