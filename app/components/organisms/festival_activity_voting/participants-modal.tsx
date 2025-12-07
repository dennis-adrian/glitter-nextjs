"use client";

import { UserCategory } from "@/app/api/users/definitions";
import ConfirmVoteModal from "@/app/components/organisms/festival_activity_voting/confirm-vote-modal";
import { Button } from "@/app/components/ui/button";
import {
	DrawerDialog,
	DrawerDialogContent,
	DrawerDialogHeader,
	DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { ActivityDetailsWithParticipants } from "@/app/lib/festivals/definitions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import { ThumbsUpIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

type ParticipantsModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	participants: ActivityDetailsWithParticipants["participants"];
	category: UserCategory;
};

export default function ParticipantsModal({
	open,
	participants,
	onOpenChange,
	category,
}: ParticipantsModalProps) {
	const [selectedParticipantId, setSelectedParticipantId] = useState<
		number | null
	>(null);
	// TODO: This should be removed when opening the PR
	const mockParticipants = [
		...participants,
		...participants,
		...participants,
		...participants,
		...participants,
	];
	return (
		<DrawerDialog open={open} onOpenChange={onOpenChange}>
			<DrawerDialogContent>
				<DrawerDialogHeader>
					<DrawerDialogTitle>
						Participantes de {getCategoryLabel(category)}
					</DrawerDialogTitle>
				</DrawerDialogHeader>
				<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 p-3">
					{mockParticipants.map((participant, index) => {
						/**
						 * In best stand activity, only one image is allowed per participant.
						 */
						const standImage = participant.proofs[0];

						return (
							<div
								key={`${participant.id}-${index}`}
								className="flex flex-col gap-2 border border-gray-200 rounded-md p-4"
							>
								{standImage && (
									<Image
										className="rounded-md mx-auto"
										src={standImage.imageUrl}
										alt={standImage.imageUrl}
										width={140}
										height={260}
										placeholder="blur"
										blurDataURL="/img/placeholders/placeholder-300x300.png"
										unoptimized
									/>
								)}
								<p className="max-w-[140px] text-ellipsis overflow-hidden text-center">
									{participant.user.displayName}
								</p>
								<Button
									className="font-normal"
									variant="outline"
									size="sm"
									onClick={() => setSelectedParticipantId(participant.id)}
								>
									Votar
									<ThumbsUpIcon className="w-4 h-4 ml-1" />
								</Button>
							</div>
						);
					})}
				</div>
				{selectedParticipantId && (
					<ConfirmVoteModal
						open={!!selectedParticipantId}
						onOpenChange={() => setSelectedParticipantId(null)}
						participantId={selectedParticipantId}
					/>
				)}
			</DrawerDialogContent>
		</DrawerDialog>
	);
}
