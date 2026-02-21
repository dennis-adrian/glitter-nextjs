import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";

export type MapCanvasConfig = {
	minX: number;
	minY: number;
	width: number;
	height: number;
	backgroundColor: string;
};

export type StandClickHandler = (
	stand: StandWithReservationsWithParticipants,
) => void;
