import { StandBase } from "@/app/api/stands/definitions";
import { collaborators, reservationCollaborators } from "@/db/schema";

export type ReservationCollaboration =
  typeof reservationCollaborators.$inferSelect;

export type ReservationCollaborationWithRelations = ReservationCollaboration & {
  reservation: {
    stand: StandBase;
  };
  collaborator: typeof collaborators.$inferSelect;
};
