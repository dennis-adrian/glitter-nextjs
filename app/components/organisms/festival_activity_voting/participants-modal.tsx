"use client";

import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";
import { BaseProfile, UserCategory } from "@/app/api/users/definitions";
import ConfirmVoteModal from "@/app/components/organisms/festival_activity_voting/confirm-vote-modal";
import {
	getValidParticipantsForVariant,
	mapStandsAndParticipantsToVotingItem,
} from "@/app/components/organisms/festival_activity_voting/utils";
import { Button } from "@/app/components/ui/button";
import {
	DrawerDialog,
	DrawerDialogContent,
	DrawerDialogHeader,
	DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { StandVotingItem } from "@/app/lib/festival_activites/definitions";
import { ActivityDetailsWithParticipants } from "@/app/lib/festivals/definitions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import { ThumbsUpIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

type ParticipantsModalProps = {
	currentProfile: BaseProfile;
	open: boolean;
	variant: ActivityDetailsWithParticipants;
	reservations: ReservationWithParticipantsAndUsersAndStand[];
	onOpenChange: (open: boolean) => void;
};

export default function ParticipantsModal({
	currentProfile,
	open,
	variant,
	reservations,
	onOpenChange,
}: ParticipantsModalProps) {
	const [selectedVotingItem, setSelectedVotingItem] =
		useState<StandVotingItem | null>(null);
	const participants = getValidParticipantsForVariant(variant);
	const standsWithParticipantProofs = mapStandsAndParticipantsToVotingItem(
		participants,
		reservations,
	);

	// TODO: This should be removed when opening the PR
	const mockParticipants = [
		...standsWithParticipantProofs,
		...standsWithParticipantProofs,
		...standsWithParticipantProofs,
		...standsWithParticipantProofs,
		...standsWithParticipantProofs,
	];
	return (
		<DrawerDialog open={open} onOpenChange={onOpenChange}>
			<DrawerDialogContent>
				<DrawerDialogHeader>
					<DrawerDialogTitle>
						Participantes de {getCategoryLabel(variant.category!)}
					</DrawerDialogTitle>
				</DrawerDialogHeader>
				<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 p-3">
					{mockParticipants.map((participant, index) => {
						/**
						 * In best stand activity, only one image is allowed per participant.
						 */
						const standImage = participant.standImage;

						return (
							<div
								key={`${participant.standId}-${index}`}
								className="flex flex-col gap-2 border border-gray-200 rounded-md p-4"
							>
								{standImage && (
									<Image
										className="rounded-md mx-auto"
										src={standImage}
										alt={participant.standName}
										width={140}
										height={260}
										placeholder="blur"
										blurDataURL="/img/placeholders/placeholder-300x300.png"
										unoptimized
									/>
								)}
								<p className="max-w-[140px] text-ellipsis overflow-hidden text-center">
									{participant.standName}
								</p>
								<Button
									className="font-normal"
									variant="outline"
									size="sm"
									onClick={() => setSelectedVotingItem(participant)}
								>
									Votar
									<ThumbsUpIcon className="w-4 h-4 ml-1" />
								</Button>
							</div>
						);
					})}
				</div>
				{selectedVotingItem && (
					<ConfirmVoteModal
						currentProfile={currentProfile}
						open={!!selectedVotingItem}
						onOpenChange={() => setSelectedVotingItem(null)}
						standId={selectedVotingItem.standId}
						variantId={variant.id}
					/>
				)}
			</DrawerDialogContent>
		</DrawerDialog>
	);
}
