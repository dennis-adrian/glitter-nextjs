import { StandBase } from "@/app/api/stands/definitions";
import { ProfileWithSocials } from "@/app/api/users/definitions";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { InvoiceWithPayments } from "@/app/data/invoices/defiinitions";
import { Collaborator } from "@/app/lib/reservations/definitions";
import { reservationParticipants, standReservations } from "@/db/schema";

export type ReservationBase = typeof standReservations.$inferSelect;
export type ReservationWithStand = ReservationBase & {
  stand: StandBase;
};

export type Participant = typeof reservationParticipants.$inferSelect & {
  user: ProfileWithSocials;
};

export type ReservationWithParticipantsAndUsers =
  typeof standReservations.$inferSelect & {
    participants: Participant[];
  };

export type ReservationWithParticipantsAndUsersAndStand =
  ReservationWithParticipantsAndUsers & {
    stand: StandBase;
  };

export type ReservationWithParticipantsAndUsersAndStandAndCollaborators =
  ReservationWithParticipantsAndUsersAndStand & {
    collaborators: {
      collaborator: Collaborator;
    }[];
  };

export type ReservationWithParticipantsAndUsersAndStandAndFestival =
  ReservationWithParticipantsAndUsersAndStand & {
    festival: FestivalBase;
  };

export type ReservationWithParticipantsAndUsersAndStandAndFestivalAndInvoicesWithPayments =
  ReservationWithParticipantsAndUsersAndStandAndFestival & {
    invoices: InvoiceWithPayments[];
  };

export type FullReservation = ReservationBase & {
  participants: Participant[];
  stand: StandBase;
  festival: FestivalBase;
  invoices: InvoiceWithPayments[];
  collaborators: {
    collaborator: Collaborator;
  }[];
};
