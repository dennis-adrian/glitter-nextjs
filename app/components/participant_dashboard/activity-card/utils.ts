import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import {
	ActivityTheme,
	EnrolledConfig,
} from "@/app/components/participant_dashboard/activity-card/types";
import type { ProofDisplayState } from "@/app/lib/festival_activites/types";

export function getEnrolledConfig(
	activity: FestivalActivityWithDetailsAndParticipants,
	profileId: number,
	proofDisplayState: ProofDisplayState,
): EnrolledConfig {
	const isProofPending =
		proofDisplayState === "pending_proof" ||
		proofDisplayState === "rejected_resubmit";

	if (activity.allowsVoting) {
		if (isProofPending) {
			const isResubmit = proofDisplayState === "rejected_resubmit";
			return {
				pendingLabel: isResubmit
					? "Correcciones solicitadas"
					: "Imagen del stand pendiente",
				pendingDescription: isResubmit
					? "Se solicitaron correcciones en la imagen de tu stand"
					: "Sube una imagen de tu stand para participar en la votación",
				ctaLabel: isResubmit ? "Editar y reenviar" : "Subir Imagen",
				ctaType: "upload",
				deadlineDate: activity.proofUploadLimitDate,
				isPending: true,
				isDestructive: isResubmit,
			};
		}

		const hasVotedAll = activity.details.every((variant) =>
			variant.votes.some((vote) => vote.voterId === profileId),
		);
		const now = new Date();
		const isInVotingWindow =
			activity.votingStartDate !== null &&
			activity.votingEndDate !== null &&
			now >= activity.votingStartDate &&
			now <= activity.votingEndDate;

		return {
			pendingLabel: "Votación pendiente",
			pendingDescription:
				"Emite tu voto para elegir el mejor stand del festival",
			ctaLabel: "Votar Ahora",
			ctaType: "link",
			deadlineDate: activity.votingEndDate,
			isPending: !hasVotedAll && isInVotingWindow,
		};
	}

	if (activity.proofType === "text" && activity.type === "coupon_book") {
		const isResubmit = proofDisplayState === "rejected_resubmit";
		return {
			pendingLabel: isResubmit
				? "Correcciones solicitadas"
				: "Detalles de promoción pendiente",
			pendingDescription: isResubmit
				? "Se solicitaron correcciones en los detalles de tu promoción"
				: "Subí los detalles de tu promoción para confirmar tu participación en la actividad",
			ctaLabel: isResubmit ? "Editar y reenviar" : "Agregar promoción",
			ctaType: "upload",
			deadlineDate: activity.proofUploadLimitDate,
			isPending: isProofPending,
			isDestructive: isResubmit,
		};
	}

	const isResubmit = proofDisplayState === "rejected_resubmit";
	return {
		pendingLabel: isResubmit
			? "Correcciones solicitadas"
			: "Diseño de sello pendiente",
		pendingDescription: isResubmit
			? "Se solicitaron correcciones en el diseño de tu sello"
			: "Sube el diseño de tu sello personalizado para confirmar tu participación",
		ctaLabel: isResubmit ? "Editar y reenviar" : "Subir Diseño",
		ctaType: "upload",
		deadlineDate: activity.proofUploadLimitDate,
		isPending: isProofPending,
		isDestructive: isResubmit,
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

	const proof = participation.proofs?.[0] ?? null;
	const proofDisplayState: ProofDisplayState = !proof
		? "pending_proof"
		: proof.proofStatus;

	return {
		isEnrolled: true,
		isRemoved: participation.removedAt !== null,
		participationId: participation.id,
		proofDisplayState,
		adminFeedback: proof?.adminFeedback ?? null,
		existingPromoDescription: proof?.promoDescription ?? null,
		existingPromoConditions: proof?.promoConditions ?? null,
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
