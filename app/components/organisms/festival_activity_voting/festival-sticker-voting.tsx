"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import ConfirmVoteModal from "@/app/components/organisms/festival_activity_voting/confirm-vote-modal";
import {
	getValidParticipantsForVariant,
	hasParticipantVotedForVariant,
} from "@/app/components/organisms/festival_activity_voting/utils";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/app/components/ui/dialog";
import { DialogClose } from "@/app/components/ui/dialog";
import {
	FestivalActivityWithDetailsAndParticipants,
	ParticipantWithUserAndProofs,
} from "@/app/lib/festivals/definitions";
import { CircleCheckIcon, Loader2Icon, ThumbsUpIcon, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

type FestivalStickerVotingProps = {
	activity: FestivalActivityWithDetailsAndParticipants;
	currentProfile: BaseProfile;
};

export default function FestivalStickerVoting({
	activity,
	currentProfile,
}: FestivalStickerVotingProps) {
	const [selectedVotingItem, setSelectedVotingItem] =
		useState<ParticipantWithUserAndProofs | null>(null);
	const [isVoting, setIsVoting] = useState(false);
	const [selectedImage, setSelectedImage] = useState<string | null>(null);
	/**
	 * The festival sticker activity has only one variant.
	 */
	const mainVariant = activity.details[0];

	const validParticipants = getValidParticipantsForVariant(mainVariant);

	const hasParticipantVoted = hasParticipantVotedForVariant(
		mainVariant,
		currentProfile.id,
	);

	if (hasParticipantVoted) {
		return (
			<div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md p-3 text-emerald-800">
				<CircleCheckIcon className="w-5 h-5 text-emerald-500" />
				<p className="text-sm text-emerald-800">
					Ya votaste por tu sticker navideño favorito
				</p>
			</div>
		);
	}

	return (
		<div>
			<p className="text-muted-foreground mb-2">
				Selecciona tu sticker navideño favorito:
			</p>

			<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 p-3">
				{validParticipants.map((participant) => {
					const participantImage = participant.proofs[0]?.imageUrl;
					return (
						<div
							key={participant.id}
							className="flex flex-col gap-2 border border-gray-200 rounded-md p-4"
						>
							{participantImage && (
								<Image
									className="rounded-md mx-auto cursor-pointer hover:opacity-90 transition-opacity"
									src={participantImage}
									alt={participant.user.displayName ?? "imagen de participante"}
									width={140}
									height={260}
									placeholder="blur"
									blurDataURL="/img/placeholders/placeholder-300x300.png"
									onClick={() => setSelectedImage(participantImage)}
								/>
							)}
							<p className="text-center">{participant.user.displayName}</p>
							<div className="flex flex-col gap-1 justify-center">
								<Button
									disabled={currentProfile.id === participant.userId}
									className="font-normal"
									variant="outline"
									size="sm"
									onClick={() => setSelectedVotingItem(participant)}
								>
									Votar
									<ThumbsUpIcon className="w-4 h-4 ml-1" />
								</Button>
								{currentProfile.id === participant.userId && (
									<p className="text-xs text-muted-foreground italic">
										* No puedes votar por tu propio stand
									</p>
								)}
							</div>
							{isVoting && (
								<div className="absolute h-dvh inset-0 bg-background/60 backdrop-blur-sm flex justify-center z-50 rounded-lg">
									<div className="flex items-center justify-center">
										<Loader2Icon className="w-10 h-10 animate-spin text-primary-500" />
									</div>
								</div>
							)}
						</div>
					);
				})}
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
						onVotingSuccess={() => {
							setSelectedVotingItem(null);
						}}
						votableType="participant"
						votableId={selectedVotingItem.id}
						variantId={mainVariant.id}
					/>
				)}
			</div>
			{selectedImage && (
				<Dialog
					open={!!selectedImage}
					onOpenChange={(open) => !open && setSelectedImage(null)}
				>
					<DialogTitle></DialogTitle>
					<DialogContent className="max-w-7xl p-0 overflow-auto border-none bg-black/95">
						<DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground z-10">
							<X className="h-6 w-6 text-white" />
							<span className="sr-only">Close</span>
						</DialogClose>
						<div className="flex items-center justify-center w-full h-full min-h-[80vh] p-6">
							<div className="relative">
								<Image
									src={selectedImage ?? ""}
									alt="Vista completa del stand"
									width={0}
									height={0}
									className="w-auto h-auto max-w-full max-h-[85vh] object-contain"
									sizes="90vw"
									unoptimized
								/>
							</div>
						</div>
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}
