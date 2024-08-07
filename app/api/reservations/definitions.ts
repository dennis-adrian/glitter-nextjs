import { StandBase } from "@/app/api/stands/definitions";
import { ProfileType, ProfileWithSocials } from "@/app/api/users/definitions";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { reservationParticipants, standReservations } from "@/db/schema";

export type ReservationBase = typeof standReservations.$inferSelect;
export type ReservationWithStand = ReservationBase & {
  stand: StandBase;
};

export type Participant = typeof reservationParticipants.$inferSelect & {
  user: ProfileType;
};

export type ReservationWithParticipantsAndUsers =
  typeof standReservations.$inferSelect & {
    participants: Participant[];
  };

export type ReservationWithParticipantsAndUsersAndStand =
  ReservationWithParticipantsAndUsers & {
    stand: StandBase;
  };

export type ReservationWithParticipantsAndUsersAndStandAndFestival =
  ReservationWithParticipantsAndUsersAndStand & {
    festival: FestivalBase;
  };
