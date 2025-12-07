"use client";

import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";
import { BaseProfile } from "@/app/api/users/definitions";
import Title from "@/app/components/atoms/title";
import ParticipantsModal from "@/app/components/organisms/festival_activity_voting/participants-modal";
import { getValidParticipantsByCategory } from "@/app/components/organisms/festival_activity_voting/utils";
import { Button } from "@/app/components/ui/button";
import {
	ActivityDetailsWithParticipants,
	FestivalActivityWithDetailsAndParticipants,
} from "@/app/lib/festivals/definitions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import { VoteIcon } from "lucide-react";
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

	const activityVariants = activity.details;

	return (
		<div>
			<p className="text-muted-foreground mb-2">
				Selecciona tu stand favorito en cada categoría:
			</p>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3 lg:gap-4">
				{activityVariants.map((variant) => (
					<div
						key={variant.id}
						className="border border-gray-200 rounded-md p-3 flex gap-2"
					>
						{variant.imageUrl && (
							<Image
								className="rounded-md"
								src={variant.imageUrl}
								alt={
									variant.category ?? "Imagen de la variante de la actividad"
								}
								width={120}
								height={120}
							/>
						)}
						<div className="flex flex-col gap-2">
							<Title level="h4" className="leading-tight">
								Iconic Stand - {getCategoryLabel(variant.category!)}
							</Title>
							<Button size="sm" onClick={() => setSelectedVariant(variant)}>
								<VoteIcon className="w-4 h-4 mr-1" />
								Votar por un participante
							</Button>
						</div>
					</div>
				))}
			</div>
			{selectedVariant && (
				<ParticipantsModal
					currentProfile={currentProfile}
					open={!!selectedVariant}
					variant={selectedVariant}
					reservations={reservations}
					onOpenChange={() => setSelectedVariant(null)}
				/>
			)}
		</div>
	);
}
