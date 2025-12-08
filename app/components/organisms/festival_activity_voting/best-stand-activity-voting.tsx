"use client";

import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";
import { BaseProfile } from "@/app/api/users/definitions";
import Title from "@/app/components/atoms/title";
import ParticipantsModal from "@/app/components/organisms/festival_activity_voting/participants-modal";
import {
	getValidParticipantsForVariant,
	hasParticipantVotedForVariant,
} from "@/app/components/organisms/festival_activity_voting/utils";
import { Button } from "@/app/components/ui/button";
import {
	ActivityDetailsWithParticipants,
	FestivalActivityWithDetailsAndParticipants,
} from "@/app/lib/festivals/definitions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import { CircleAlertIcon, CircleCheckIcon, VoteIcon } from "lucide-react";
import { DateTime } from "luxon";
import Image from "next/image";
import { useState } from "react";

type BestStandActivityVotingProps = {
	currentProfile: BaseProfile;
	activity: FestivalActivityWithDetailsAndParticipants;
	reservations: ReservationWithParticipantsAndUsersAndStand[];
};

export default function BestStandActivityVoting({
	currentProfile,
	activity,
	reservations,
}: BestStandActivityVotingProps) {
	const [selectedVariant, setSelectedVariant] =
		useState<ActivityDetailsWithParticipants | null>(null);
	const [isParticipantsModalOpen, setIsParticipantsModalOpen] = useState(false);

	const activityVariants = activity.details;

	const handleCategoryClick = (variant: ActivityDetailsWithParticipants) => {
		setSelectedVariant(variant);
		setIsParticipantsModalOpen(true);
	};

	const isVotingOpen =
		activity.votingStartDate && activity.votingEndDate
			? DateTime.now() >= DateTime.fromJSDate(activity.votingStartDate) &&
				DateTime.now() <= DateTime.fromJSDate(activity.votingEndDate)
			: false;

	return (
		<div>
			<p className="text-muted-foreground mb-2">
				Selecciona tu stand favorito en cada categoría:
			</p>

			<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3 xl:gap-4">
				{activityVariants.map((variant) => (
					<div
						key={variant.id}
						className="border border-gray-200 rounded-md p-3 flex gap-2"
					>
						{variant.imageUrl && (
							<Image
								className="rounded-md aspect-square self-start"
								src={variant.imageUrl}
								alt={
									variant.category ?? "Imagen de la variante de la actividad"
								}
								width={100}
								height={100}
							/>
						)}
						<div className="flex flex-col gap-2">
							<Title level="h4" className="leading-tight">
								Iconic Stand -{" "}
								{variant.category
									? getCategoryLabel(variant.category)
									: "Sin categoría"}
							</Title>
							{getValidParticipantsForVariant(variant).length === 0 ? (
								<div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-md p-3 text-amber-800">
									<CircleAlertIcon className="w-5 h-5 text-amber-500 shrink-0" />
									<p className="text-sm text-amber-800">
										No hay participantes disponibles para votar
									</p>
								</div>
							) : hasParticipantVotedForVariant(variant, currentProfile.id) ? (
								<div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md p-3 text-emerald-800">
									<CircleCheckIcon className="w-5 h-5 text-emerald-500" />
									<p className="text-sm text-emerald-800">
										Ya votaste en esta categoría
									</p>
								</div>
							) : (
								isVotingOpen && (
									<Button
										className="font-normal"
										size="sm"
										variant="outline"
										onClick={() => handleCategoryClick(variant)}
									>
										<VoteIcon className="w-4 h-4 mr-1" />
										Agregar voto
									</Button>
								)
							)}
						</div>
					</div>
				))}
			</div>
			{selectedVariant && isVotingOpen && (
				<ParticipantsModal
					currentProfile={currentProfile}
					open={isParticipantsModalOpen}
					variant={selectedVariant}
					reservations={reservations}
					participants={getValidParticipantsForVariant(selectedVariant)}
					onVotingSuccess={() => {
						setIsParticipantsModalOpen(false);
						setSelectedVariant(null);
					}}
					onOpenChange={setIsParticipantsModalOpen}
				/>
			)}
		</div>
	);
}
