import { StandBase } from "@/app/api/stands/definitions";
import {
  collaborators,
  collaboratorsAttendanceLogs,
  reservationCollaborators,
} from "@/db/schema";
import { FestivalWithDates } from "../festivals/definitions";

export type ReservationCollaboration =
  typeof reservationCollaborators.$inferSelect;

export type ReservationCollaborationWithRelations = ReservationCollaboration & {
  reservation: {
    stand: StandBase;
    festival: FestivalWithDates;
  };
  collaborator: typeof collaborators.$inferSelect;
  collaboratorsAttendanceLogs: CollaboratorAttendanceLog[];
};

export type CollaboratorAttendanceLog =
  typeof collaboratorsAttendanceLogs.$inferSelect;
