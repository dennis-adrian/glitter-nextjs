import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";

export type MapBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

export type MapCanvasConfig = MapBounds & {
  backgroundColor: string;
};

export type StandClickHandler = (
  stand: StandWithReservationsWithParticipants,
) => void;
