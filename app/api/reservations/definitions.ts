import { StandBase } from "@/app/api/stands/definitions";
import { BaseProfile, ProfileSubcategoryWithSubcategory, ProfileWithSocials, UserSocial } from "@/app/api/users/definitions";
import { InvoiceWithPayments } from "@/app/data/invoices/definitions";
import { FestivalBase } from "@/app/lib/festivals/definitions";
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
  participants: (typeof reservationParticipants.$inferSelect & {
    user: BaseProfile & {
      userSocials: UserSocial[];
      profileSubcategories: ProfileSubcategoryWithSubcategory[];
    };
  })[];
  stand: StandBase;
  festival: FestivalBase;
  invoices: InvoiceWithPayments[];
  collaborators: {
    collaborator: Collaborator;
  }[];
};
