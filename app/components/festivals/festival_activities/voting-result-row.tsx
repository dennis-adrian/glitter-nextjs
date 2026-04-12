"use client";

import Image from "next/image";
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	InfoIcon,
	TrophyIcon,
	XCircleIcon,
} from "lucide-react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { Badge } from "@/app/components/ui/badge";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/app/components/ui/drawer";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/app/components/ui/popover";
import { Progress } from "@/app/components/ui/progress";
import {
	ActivityDetailsWithParticipants,
	ParticipantWithUserAndProofs,
} from "@/app/lib/festivals/definitions";

type VotingResultRowProps = {
	participant: ParticipantWithUserAndProofs;
	voteCount: number;
	percentage: number;
	rank: number;
	hasVotedAllVariants: boolean;
	isEligibleWinner: boolean;
	allDetails: ActivityDetailsWithParticipants[];
};

export default function VotingResultRow({
	participant,
	voteCount,
	percentage,
	rank,
	hasVotedAllVariants,
	isEligibleWinner,
	allDetails,
}: VotingResultRowProps) {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const proof = participant.proofs?.[0];

	const variantVoteStatus = allDetails.map((detail) => {
		const voted = detail.votes.some((v) => v.voterId === participant.userId);
		const votedForSelf =
			voted &&
			detail.votes.some(
				(v) =>
					v.voterId === participant.userId &&
					v.participantId === participant.id,
			);
		return { detail, voted, votedForSelf };
	});

	const votedForSelfInAny = variantVoteStatus.some((s) => s.votedForSelf);

	const detailsContent = (
		<div className="space-y-3">
			<div className="space-y-1.5">
				{variantVoteStatus.map(({ detail, voted, votedForSelf }, i) => (
					<div key={detail.id} className="flex items-center gap-2 text-sm">
						{voted ? (
							<CheckCircle2Icon className="w-3.5 h-3.5 shrink-0 text-green-500" />
						) : (
							<XCircleIcon className="w-3.5 h-3.5 shrink-0 text-destructive" />
						)}
						<span className="flex-1 truncate">
							{detail.description ?? `Variante ${i + 1}`}
						</span>
						{votedForSelf && (
							<span className="text-xs font-medium text-destructive">
								auto-voto
							</span>
						)}
					</div>
				))}
			</div>
			{votedForSelfInAny && (
				<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive">
					<AlertTriangleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
					<p className="text-xs">
						Este participante votó por sí mismo en al menos una variante.
					</p>
				</div>
			)}
		</div>
	);

	const infoTrigger = (
		<button
			className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
			aria-label="Ver detalles de votación"
		>
			<InfoIcon className="w-4 h-4" />
		</button>
	);

	return (
		<div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
			{/* Rank */}
			<div className="w-7 shrink-0 flex justify-center pt-0.5">
				{isEligibleWinner ? (
					<TrophyIcon className="w-5 h-5 text-amber-500" />
				) : (
					<span className="text-sm font-semibold text-muted-foreground">
						{rank + 1}
					</span>
				)}
			</div>

			{/* Stand image */}
			<div className="w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-md overflow-hidden bg-muted">
				{proof?.imageUrl ? (
					<Image
						src={proof.imageUrl}
						alt={`Stand de ${participant.user.displayName}`}
						width={48}
						height={48}
						className="object-cover w-full h-full"
					/>
				) : (
					<div className="w-full h-full" />
				)}
			</div>

			{/* Content: name + stats */}
			<div className="flex-1 min-w-0 space-y-1.5">
				{/* Name row */}
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-1.5 min-w-0">
						<p className="text-sm font-medium truncate">
							{participant.user.displayName ??
								participant.user.firstName ??
								`Participante #${participant.id}`}
						</p>
						{hasVotedAllVariants ? (
							<CheckCircle2Icon className="w-3.5 h-3.5 shrink-0 text-green-500" />
						) : (
							<XCircleIcon className="w-3.5 h-3.5 shrink-0 text-destructive" />
						)}
					</div>

					{/* Info trigger — drawer on mobile, popover on desktop */}
					{isDesktop ? (
						<Popover>
							<PopoverTrigger asChild>{infoTrigger}</PopoverTrigger>
							<PopoverContent align="end" className="w-64 space-y-3">
								<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
									Votación del participante
								</p>
								{detailsContent}
							</PopoverContent>
						</Popover>
					) : (
						<Drawer>
							<DrawerTrigger asChild>{infoTrigger}</DrawerTrigger>
							<DrawerContent>
								<DrawerHeader>
									<DrawerTitle>
										{participant.user.displayName ??
											participant.user.firstName ??
											`Participante #${participant.id}`}
									</DrawerTitle>
								</DrawerHeader>
								<div className="px-4 pb-6 space-y-2">
									<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
										Votación del participante
									</p>
									{detailsContent}
								</div>
							</DrawerContent>
						</Drawer>
					)}
				</div>

				{/* Stats row: progress + vote count + % */}
				<div className="flex items-center gap-2">
					<Progress value={percentage} className="flex-1 h-1.5" />
					<Badge
						variant={isEligibleWinner ? "default" : "secondary"}
						className="tabular-nums shrink-0"
					>
						{voteCount} voto{voteCount !== 1 ? "s" : ""}
					</Badge>
					<span className="text-xs text-muted-foreground shrink-0 w-8 text-right">
						{percentage}%
					</span>
				</div>
			</div>
		</div>
	);
}
