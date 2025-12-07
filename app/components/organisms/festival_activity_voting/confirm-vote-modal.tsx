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
import { addFestivalActivityVote } from "@/app/lib/festival_activites/actions";
import { CircleAlertIcon } from "lucide-react";
import { toast } from "sonner";

type ConfirmVoteModalProps = {
	currentProfile: BaseProfile;
	open: boolean;
	standId: number;
	variantId: number;
	onOpenChange: (open: boolean) => void;
	onVotingChange: (voting: boolean) => void;
};

export default function ConfirmVoteModal({
	currentProfile,
	open,
	standId,
	variantId,
	onOpenChange,
	onVotingChange,
}: ConfirmVoteModalProps) {
	const addVote = async () => {
		onVotingChange(true);
		const res = await addFestivalActivityVote({
			activityVariantId: variantId,
			voterId: currentProfile.id,
			votableType: "stand",
			standId: standId,
		});

		if (res.success) {
			onOpenChange(false);
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
					<AlertDialogCancel onClick={() => onOpenChange(false)}>
						Cancelar
					</AlertDialogCancel>
					<AlertDialogAction onClick={addVote}>Votar</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
