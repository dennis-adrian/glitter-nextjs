"use client";

import { ParticipationWithParticipantAndReservations } from "@/app/api/users/definitions";
import { Modal } from "@/app/components/atoms/modal";
import RegisterInfractionForm from "@/app/components/festivals/participants/forms/register-infraction-form";
import { Button } from "@/app/components/ui/button";
import { InfractionType } from "@/app/lib/infractions/definitions";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontalIcon, NotepadTextIcon } from "lucide-react";
import { useState } from "react";

type ActionCellProps = {
	participant: ParticipationWithParticipantAndReservations;
	infractionTypes: InfractionType[];
};
export default function ActionsCell({
	participant,
	infractionTypes,
}: ActionCellProps) {
	const [infractionModalOpen, setInfractionModalOpen] = useState(false);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" className="h-8 w-8 p-0">
						<span className="sr-only">Open menu</span>
						<MoreHorizontalIcon className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuLabel>Acciones</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => setInfractionModalOpen(true)}>
						<NotepadTextIcon className="mr-2 h-4 w-4" />
						Registrar infracción
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Modal
				isOpen={infractionModalOpen}
				onClose={() => setInfractionModalOpen(false)}
				title="Registrar infracción"
			>
				<div className="px-1">
					<RegisterInfractionForm
						participantId={participant.userId}
						festivalId={participant.reservation.festivalId}
						infractionTypes={infractionTypes}
						onSuccess={() => setInfractionModalOpen(false)}
					/>
				</div>
			</Modal>
		</>
	);
}
