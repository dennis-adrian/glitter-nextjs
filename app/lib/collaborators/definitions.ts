import { ReservationStandMember } from "@/app/api/reservations/definitions";
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
    /** The originally selected half; `members` is what is occupied. */
    stand: StandBase;
    members: ReservationStandMember[];
    festival: FestivalWithDates;
  };
  /** Only what the staff table renders; never the identification number. */
  collaborator: Pick<
    typeof collaborators.$inferSelect,
    "id" | "firstName" | "lastName"
  >;
  collaboratorsAttendanceLogs: CollaboratorAttendanceLog[];
};

export type CollaboratorAttendanceLog =
  typeof collaboratorsAttendanceLogs.$inferSelect;
