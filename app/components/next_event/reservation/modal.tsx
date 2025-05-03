"use client";

import { useMediaQuery } from "@/app/hooks/use-media-query";

import ReservationForm from "@/app/components/next_event/reservation/form";
import { Button } from "@/app/components/ui/button";
import { BaseProfile, ProfileType } from "@/app/api/users/definitions";
import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { FestivalBase } from "@/app/data/festivals/definitions";
import {
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/app/components/ui/dialog";
import { Dialog } from "@/app/components/ui/dialog";

export function ReservationModal({
	artists,
	open,
	profile,
	stand,
	festival,
	onOpenChange,
	onClose,
}: {
	artists: BaseProfile[];
	open: boolean;
	profile?: ProfileType | null;
	stand: StandWithReservationsWithParticipants | null;
	festival: FestivalBase;
	onClose: () => void;
	onOpenChange: (open: boolean) => void;
}) {
	const isDesktop = useMediaQuery("(min-width: 768px)");

	if (!stand || !profile) {
		return null;
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{stand
							? `Reservar espacio ${stand.label}${stand.standNumber}`
							: "Reservar stand"}
					</DialogTitle>
				</DialogHeader>
				<ReservationForm
					artists={artists}
					isDesktop={isDesktop}
					festival={festival}
					profile={profile}
					stand={stand}
					onModalClose={onClose}
				/>
				{isDesktop ? null : (
					<DialogFooter className="pt-2 w-full">
						<DialogClose>
							<Button variant="outline" className="w-full">
								Cancelar
							</Button>
						</DialogClose>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
