"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import {
	AlertDialog,
	AlertDialogTitle,
	AlertDialogHeader,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogFooter,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import { addFestivalActivityVote } from "@/app/lib/festival_activites/actions";
import { CircleAlertIcon } from "lucide-react";
import { toast } from "sonner";

type ConfirmVoteModalProps = {
	currentProfile: BaseProfile;
	open: boolean;
	variantId: number;
	onOpenChange: (open: boolean) => void;
	onVotingChange: (voting: boolean) => void;
	onVotingSuccess: () => void;
	votableType: "stand" | "participant";
	votableId: number;
};

export default function ConfirmVoteModal({
	currentProfile,
	open,
	variantId,
	onOpenChange,
	onVotingChange,
	onVotingSuccess,
	votableType,
	votableId,
}: ConfirmVoteModalProps) {
	const addVote = async () => {
		onVotingChange(true);

		let res;
		if (votableType === "stand") {
			res = await addFestivalActivityVote({
				activityVariantId: variantId,
				voterId: currentProfile.id,
				votableType: votableType,
				standId: votableId,
			});
		} else {
			res = await addFestivalActivityVote({
				activityVariantId: variantId,
				voterId: currentProfile.id,
				votableType: votableType,
				participantId: votableId,
			});
		}

		if (res.success) {
			onVotingSuccess();
			toast.success(res.message);
		} else {
			toast.error(res.message);
		}

		onVotingChange(false);
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Confirmar votación</AlertDialogTitle>
					<AlertDialogDescription></AlertDialogDescription>
				</AlertDialogHeader>
				<div className="flex flex-col justify-center items-center gap-2">
					<CircleAlertIcon className="w-12 h-12 text-amber-500" />
					<p className="text-center">
						¿Estás seguro de querer votar por este participante?
					</p>
				</div>
				<AlertDialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button type="button" onClick={addVote}>
						Votar
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
