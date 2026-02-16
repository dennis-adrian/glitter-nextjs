"use client";

import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@/app/components/ui/drawer";

type PublicMapDrawerProps = {
	stand: StandWithReservationsWithParticipants | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

function getParticipantNames(
	stand: StandWithReservationsWithParticipants,
): string[] {
	return stand.reservations
		?.filter((r) => r.status !== "rejected")
		.flatMap((r) =>
			r.participants.map(
				(p) => p.user.displayName || "Participante",
			),
		) ?? [];
}

export default function PublicMapDrawer({
	stand,
	open,
	onOpenChange,
}: PublicMapDrawerProps) {
	if (!stand) return null;

	const { label, standNumber, status } = stand;
	const isOccupied = status === "reserved" || status === "confirmed";
	const participantNames = isOccupied ? getParticipantNames(stand) : [];

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>
						Espacio {label}
						{standNumber}
					</DrawerTitle>
				</DrawerHeader>
				<div className="px-4 pb-6">
					<p className="text-sm text-muted-foreground">
						{isOccupied ? "Ocupado" : "Disponible"}
					</p>
					{participantNames.length > 0 && (
						<p className="text-sm text-muted-foreground mt-1">
							{participantNames.join(", ")}
						</p>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	);
}
