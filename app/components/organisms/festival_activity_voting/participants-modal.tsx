"use client";

import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";
import { BaseProfile } from "@/app/api/users/definitions";
import ConfirmVoteModal from "@/app/components/organisms/festival_activity_voting/confirm-vote-modal";
import { mapStandsAndParticipantsToVotingItem } from "@/app/components/organisms/festival_activity_voting/utils";
import { Button } from "@/app/components/ui/button";
import {
	DrawerDialog,
	DrawerDialogContent,
	DrawerDialogFooter,
	DrawerDialogHeader,
	DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { StandVotingItem } from "@/app/lib/festival_activites/definitions";
import {
	ActivityDetailsWithParticipants,
	ParticipantWithUserAndProofs,
} from "@/app/lib/festivals/definitions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import { Loader2Icon, ThumbsUpIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

type ParticipantsModalProps = {
	currentProfile: BaseProfile;
	open: boolean;
	variant: ActivityDetailsWithParticipants;
	reservations: ReservationWithParticipantsAndUsersAndStand[];
	participants: ParticipantWithUserAndProofs[];
	onOpenChange: (open: boolean) => void;
	onVotingSuccess: () => void;
};

export default function ParticipantsModal({
	currentProfile,
	open,
	variant,
	reservations,
	participants,
	onOpenChange,
	onVotingSuccess,
}: ParticipantsModalProps) {
	const [selectedVotingItem, setSelectedVotingItem] =
		useState<StandVotingItem | null>(null);
	const [isVoting, setIsVoting] = useState(false);

	const standsWithParticipantProofs = mapStandsAndParticipantsToVotingItem(
		participants,
		reservations,
	);

	const currentParticipantStand = reservations.find((reservation) =>
		reservation.participants.some((p) => p.userId === currentProfile.id),
	)?.stand;

	return (
		<DrawerDialog open={open} onOpenChange={onOpenChange}>
			<DrawerDialogContent>
				<DrawerDialogHeader>
					<DrawerDialogTitle>
						Participantes de{" "}
						{variant.category
							? getCategoryLabel(variant.category)
							: "Sin categoría"}
					</DrawerDialogTitle>
				</DrawerDialogHeader>
				<div className="relative">
					<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 p-3">
						{standsWithParticipantProofs.map((participant, index) => {
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
										/>
									)}
									<p className="text-center">{participant.standName}</p>
									<div className="flex flex-col gap-1 justify-center">
										<Button
											disabled={
												currentParticipantStand?.id === participant.standId
											}
											className="font-normal"
											variant="outline"
											size="sm"
											onClick={() => setSelectedVotingItem(participant)}
										>
											Votar
											<ThumbsUpIcon className="w-4 h-4 ml-1" />
										</Button>
										{currentParticipantStand?.id === participant.standId && (
											<p className="text-xs text-muted-foreground italic">
												* No puedes votar por tu propio stand
											</p>
										)}
									</div>
								</div>
							);
						})}
					</div>
					{isVoting && (
						<div className="absolute h-dvh inset-0 bg-background/60 backdrop-blur-sm flex justify-center z-50 rounded-lg">
							<div className="flex items-center justify-center">
								<Loader2Icon className="w-10 h-10 animate-spin text-primary-500" />
							</div>
						</div>
					)}
				</div>
				{selectedVotingItem && (
					<ConfirmVoteModal
						currentProfile={currentProfile}
						open={!!selectedVotingItem}
						onOpenChange={(open) => {
							if (!open) {
								setSelectedVotingItem(null);
							}
						}}
						onVotingChange={setIsVoting}
						onVotingSuccess={onVotingSuccess}
						standId={selectedVotingItem.standId}
						variantId={variant.id}
					/>
				)}
				<DrawerDialogFooter className="sticky bottom-0 bg-card border-t">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cerrar
					</Button>
				</DrawerDialogFooter>
			</DrawerDialogContent>
		</DrawerDialog>
	);
}
