import { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";
import { ProfileType } from "@/app/api/users/definitions";

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

export type MapStandProps = {
  stand: StandWithReservationsWithParticipants;
  canBeReserved: boolean;
  participantProfiles: ProfileType[];
  onClick?: StandClickHandler;
};
