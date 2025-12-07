"use client";

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
import { CircleAlertIcon } from "lucide-react";

type ConfirmVoteModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	participantId: number;
};

export default function ConfirmVoteModal({
	open,
	onOpenChange,
	participantId,
}: ConfirmVoteModalProps) {
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
					{/* TODO: Implement the actual vote action */}
					<AlertDialogAction
						onClick={() =>
							console.log("votar por el participante", participantId)
						}
					>
						Votar
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
