import { StandBase } from "@/app/api/stands/definitions";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import {
  collaborators,
  collaboratorsAttendanceLogs,
  reservationCollaborators,
} from "@/db/schema";

export type ReservationCollaboration =
  typeof reservationCollaborators.$inferSelect;

export type ReservationCollaborationWithRelations = ReservationCollaboration & {
  reservation: {
    stand: StandBase;
    festival: FestivalWithDates;
  };
  collaborator: typeof collaborators.$inferSelect;
  collaboratorsAttendanceLogs: (typeof collaboratorsAttendanceLogs.$inferSelect)[];
};
